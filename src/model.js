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
			if (user.otp !== utils.hashString(otp)) return utils.httpError(401, "Invalid OTP");

			// Authenticate the user
			const token = uuid();
			const devices = { token, userAgent };
			await Users.updateOne({ _id: user._id }, { $push: { devices }, $unset: { otp: 1 }, lastLoginAt: date });

			req.session.token = token;

			return res.json({ message: "Authenticated", email });
		}

		otp = randomInt(100000, 999999);
		const otpHash = utils.hashString(otp);

		if (!user) {
			await new Users({ email, otp: otpHash, createdAt: date }).save();
		} else {
			await Users.updateOne({ _id: user._id }, { otp: otpHash });
		}

		sendEmail.otpEmail(email, otp);

		setTimeout(async () => {
			await Users.updateOne({ _id: user._id, otp: otpHash }, { $unset: { otp: 1 } });
		}, 1000 * 60 * 15);

		return res.json({ message: `One-time password sent to ${email}.` });
	} catch (error) {
		next(error);
	}
};

const me = async (req, res, next) => {
	try {
		const user = await Users.findOne({ _id: req.user._id })
			.populate([{ path: "channels.channel", select: "link feedURL title description imageURL" }])
			.select("email membershipType channels createdOn");

		user.channels = user.channels.sort((a, b) => new Date(b.subscribedOn) - new Date(a.subscribedOn));

		res.json(user);
	} catch (error) {
		next(error);
	}
};

const updatePushCredentials = async (req, res, next) => {
	try {
		const credentials = req.body.credentials;

		await Users.findOneAndUpdate(
			{ _id: req.user._id, "devices.token": req.token },
			{ $set: { "devices.$.pushCredentials": credentials } }
		);
		res.json({ message: "Push credentials updated" });
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
		} catch (err) {
			// Do nothing
		}
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

const enableNotification = async (req, res, next) => {
	try {
		let channelId = req.body.channelId;

		await Users.findOneAndUpdate(
			{ _id: req.user._id, "channels.channel": channelId },
			{ $set: { "channels.$.notification": true } }
		);

		res.json({ message: "Notifications enabled" });
	} catch (error) {
		next(error);
	}
};

const disableNotification = async (req, res, next) => {
	try {
		let channelId = req.body.channelId;

		await Users.findOneAndUpdate(
			{ _id: req.user._id, "channels.channel": channelId },
			{ $set: { "channels.$.notification": false } }
		);

		res.json({ message: "Notifications disabled" });
	} catch (error) {
		next(error);
	}
};

const getItems = async (req, res, next) => {
	try {
		let user = req.user;

		if (!user) return utils.httpError(400, "Invalid request");

		const channelIds = user.channels.map((user) => user.channel);

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

		res.json({ items });
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
	updatePushCredentials,
	subscribeChannel,
	unsubscribeChannel,
	enableNotification,
	disableNotification,
	getItems,
	logOut,
};
