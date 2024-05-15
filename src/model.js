const randomString = require("randomstring");
const uuid = require("uuid").v4;

const utils = require("./utils");
const sendEmail = require("./email");
const rssFetcher = require("./rss-fetcher");

const { Users, Channels, Items } = require("./collections").getInstance();

const { scheduleChannelFetch } = require("./scheduler");
const config = require("./config");

const signUp = async (req, res, next) => {
	try {
		const username = utils.getValidUsername(req.body.username);
		await utils.isNewUsername(username);
		const email = utils.getValidEmail(req.body.email);
		await utils.isNewEmail(email);
		const password = utils.getValidPassword(req.body.password);
		const date = new Date();

		const emailVerificationCode = uuid();
		const token = uuid();

		await new Users({
			username,
			email,
			password,
			emailVerificationCode,
			token: [token],
			createdAt: date,
		}).save();
		req.session.token = token;

		res.json({ message: "Account created. Please verify your email.", username });

		sendEmail.verificationEmail(username, email, emailVerificationCode);
	} catch (error) {
		next(error);
	}
};

const logIn = async (req, res, next) => {
	try {
		const username = utils.getValidUsername(req.body.username);
		const password = utils.getValidPassword(req.body.password);

		const user = await Users.findOne({ username, password }).exec();

		if (!user) return utils.httpError(400, "Invalid user credentials");

		const token = uuid();

		await Users.updateOne({ _id: user._id }, { $push: { token }, lastLoginAt: new Date() });

		req.session.token = token;
		res.json({ message: "Logged in", username: user.username });
	} catch (error) {
		next(error);
	}
};

const verifyEmail = async (req, res, next) => {
	try {
		const code = req.params.code;

		const user = await Users.findOne({ emailVerificationCode: code }).exec();
		if (!user) return res.status(400).send("Invalid email verification code");

		await Users.updateOne({ _id: user._id }, { $unset: { emailVerificationCode: 1 }, lastUpdatedAt: new Date() });

		res.send("Email verified");
	} catch (error) {
		next(error);
	}
};

const resetPassword = async (req, res, next) => {
	try {
		const username = utils.getValidUsername(req.body.username);

		const user = await Users.findOne({ username }).exec();
		if (!user) return utils.httpError(400, "Invalid username");

		const passwordString = randomString.generate(8);
		const password = await utils.getValidPassword(passwordString);

		await Users.updateOne({ _id: user._id }, { password, lastUpdatedOn: new Date() });
		await sendEmail.resetPasswordEmail(user.email, passwordString);

		res.json({ message: "Password resetted" });
	} catch (error) {
		next(error);
	}
};

const me = async (req, res, next) => {
	try {
		const { username, email, bio, membershipType, createdOn } = req.user;

		res.json({ username, email, bio, membershipType, createdOn });
	} catch (error) {
		next(error);
	}
};

const updateAccount = async (req, res, next) => {
	try {
		const username =
			req.body.username && req.body.username !== req.user.username
				? await utils.getValidUsername(req.body.username)
				: null;
		if (username) await utils.isNewUsername(username, req.user._id);

		const email =
			req.body.email && req.body.email !== req.user.email ? await utils.getValidEmail(req.body.email) : null;
		if (email) await utils.isNewEmail(email, req.user._id);

		const password = req.body.password ? await utils.getValidPassword(req.body.password) : null;

		const bio = req.body.bio ? req.body.bio.substring(0, 160) : null;

		const updateFields = {};
		if (username) updateFields["username"] = username;
		if (password) updateFields["password"] = password;
		if (bio) updateFields["bio"] = bio;

		if (email && email !== req.user.email) {
			const emailVerificationCode = uuid();
			updateFields["email"] = email;
			updateFields["emailVerificationCode"] = emailVerificationCode;
			await sendEmail.verificationEmail(req.user.username, email, emailVerificationCode);
		}

		await Users.updateOne({ _id: req.user._id }, { ...updateFields, lastUpdatedOn: new Date() });
		res.json({
			message: `Account updated. ${updateFields["emailVerificationCode"] ? "Please verify your email" : ""}`,
		});
	} catch (error) {
		next(error);
	}
};

const getChannels = async (req, res, next) => {
	try {
		const channels = await Channels.find({ subscribers: req.user._id })
			.select("link feedURL title description imageURL")
			.exec();
		res.json({ channels });
	} catch (error) {
		next(error);
	}
};

const subscribeChannel = async (req, res, next) => {
	try {
		if (req.user.emailVerificationCode) {
			return res.status(400).json({ message: "Please verify your email." });
		}

		let feedURL = utils.getValidURL(req.body.url);
		const date = new Date();

		let rssData = await rssFetcher(feedURL);

		if (rssData.error) {
			feedURL = await utils.findFeedURL(feedURL);
			if (!feedURL) {
				return utils.httpError(400, rssData.error);
			}
			rssData = await rssFetcher(feedURL);
		}

		if (rssData.error) {
			return utils.httpError(400, rssData.error);
		}

		let channel = await Channels.findOne({ link: rssData.channel.link }).exec();
		if (!channel) {
			channel = await new Channels({ ...rssData.channel, createdOn: date }).save();

			scheduleChannelFetch(channel);
		}

		await Channels.updateOne({ _id: channel._id }, { $push: { subscribers: req.user._id }, lastFetchedOn: date });

		res.json({ message: "Channel subscribed" });

		try {
			const itemUpserts = rssData.items.map((item) => {
				return Items.findOneAndUpdate(
					{ guid: item.guid },
					{ channel: channel._id, ...item, fetchedOn: date },
					{ new: true, upsert: true }
				);
			});
			await Promise.all(itemUpserts);
		} catch (err) {}
	} catch (error) {
		next(error);
	}
};

const unsubscribeChannel = async (req, res, next) => {
	try {
		let channelId = req.body.channelId;
		await Channels.updateOne({ _id: channelId }, { $pull: { subscribers: req.user._id } });

		res.json({ message: "Channel unsubscribed" });
	} catch (error) {
		next(error);
	}
};

const getItems = async (req, res, next) => {
	try {
		const username = req.params.username;
		let user = req.user;

		if (username) user = await Users.findOne({ username }).exec();

		if (!user) return utils.httpError(400, "Invalid request");

		const channelIds = await Channels.find({ subscribers: user._id }).select("_id").exec();

		const skip = Number(req.query.skip) || 0;
		const searchString = req.query.query;

		let query = { channel: { $in: channelIds.map((c) => c._id) } };
		if (searchString) query["$text"] = { $search: searchString };

		const items = await Items.find(query)
			.select("guid channel title link content textContent author comments publishedOn")
			.populate("channel", "link feedURL title imageURL")
			.skip(skip)
			.limit(50)
			.sort("-publishedOn")
			.exec();

		res.json({ items, bio: user.bio });
	} catch (error) {
		next(error);
	}
};

const logOut = async (req, res, next) => {
	try {
		await Users.updateOne({ _id: req.user._id }, { $pull: { devices: { token: req.token } } });
		req.session.destroy();
		res.json({ message: "Logged out" });
	} catch (error) {
		next(error);
	}
};

module.exports = {
	signUp,
	logIn,
	verifyEmail,
	resetPassword,
	me,
	updateAccount,
	getChannels,
	subscribeChannel,
	unsubscribeChannel,
	getItems,
	logOut,
};
