const randomString = require("randomstring");
const { randomInt } = require("crypto");
const uuid = require("uuid").v4;

const utils = require("./utils");
const sendEmail = require("./email");
const rssFetcher = require("./rss-fetcher");

const { Users, Channels, Items } = require("./collections").getInstance();

const { scheduleChannelFetch } = require("./scheduler");

const authenticate = async (req, res, next) => {
	try {
		const email = utils.getValidEmail(req.body.email);
		const userAgent = req.get("user-agent");

		const date = new Date();

		let otp = req.body.otp;
		let user = await utils.getUserByEmail(email);

		if (otp) {
			if (!user) return utils.httpError(401, "Invalid user");
			if (user.otp !== otp) return utils.httpError(401, "Invalid OTP");

			// Authenticate the user
			const token = uuid();
			const devices = { token, userAgent };
			await Users.updateOne({ _id: user._id }, { $push: { devices }, lastLoginAt: date });

			req.session.token = token;

			return res.json({ message: "Authenticated", email });
		}

		otp = randomInt(100000, 999999);

		if (!user) {
			await new Users({ email, otp, createdAt: date }).save();
		} else {
			await Users.updateOne({ _id: user._id }, { otp });
		}

		sendEmail.otpEmail(email, otp);

		return res.json({ message: `One-time password sent to ${email}.` });
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

		const bio = req.body.bio ? req.body.bio.substring(0, 160) : null;

		const updateFields = {};
		if (username) updateFields["username"] = username;
		if (bio) updateFields["bio"] = bio;

		await Users.updateOne({ _id: req.user._id }, { ...updateFields, lastUpdatedOn: new Date() });
		res.json({ message: "Account updated." });
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

		await Promise.all([
			Channels.updateOne({ _id: channel._id }, { $push: { subscribers: req.user._id }, lastFetchedOn: date }),
			Users.updateOne({ _id: req.user._id }, { $push: { channels: { channel: channel._id, subscribedOn: date } } }),
		]);

		res.json({ message: "Channel subscribed" });

		try {
			const itemUpserts = rssData.items.map((item) => {
				return Items.findOneAndUpdate(
					{ guid: item.guid },
					{ channel: channel._id, ...item, touchedOn: date },
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
		await Users.updateOne({ _id: req.user._id }, { $pull: { channels: { channel: channelId } } });

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
	authenticate,
	me,
	updateAccount,
	getChannels,
	subscribeChannel,
	unsubscribeChannel,
	getItems,
	logOut,
};
