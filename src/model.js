const randomString = require("randomstring");
const uuid = require("uuid").v4;

const config = require("./config");
const utils = require("./utils");
const sendEmail = require("./email");

const { Users } = require("./collections").getInstance();

const signUp = async (req, res, next) => {
	try {
		const email = utils.getValidEmail(req.body.email);
		await utils.isNewEmail(email);
		const password = utils.getValidPassword(req.body.password);
		const date = new Date();

		const emailVerificationCode = uuid();
		const token = uuid();

		await new Users({
			email,
			password,
			emailVerificationCode,
			token: [token],
			createdAt: date,
		}).save();
		req.session.token = token;

		res.json({ message: "Account created. Please verify your email." });

		sendEmail.verificationEmail(email, emailVerificationCode);
	} catch (error) {
		next(error);
	}
};

const logIn = async (req, res, next) => {
	try {
		const email = utils.getValidEmail(req.body.email);
		const password = utils.getValidPassword(req.body.password);

		const user = await Users.findOne({ email: { $regex: new RegExp(`^${email}$`, "i") }, password }).exec();

		if (!user) return utils.httpError(400, "Invalid user credentials");

		const userAgent = req.get("user-agent");

		const token = uuid();
		const devices = { token, userAgent };

		await Users.updateOne({ _id: user._id }, { $push: { devices }, lastLoginAt: new Date() });

		req.session.token = token;
		res.json({ message: "Logged in", email: user.email });
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
		const email = req.body.email;

		const channel = await Users.findOne({ email }).exec();
		if (!channel) return utils.httpError(400, "Invalid Email");

		const passwordString = randomString.generate(8);
		const password = await utils.getValidPassword(passwordString);

		await Users.updateOne({ _id: channel._id }, { password, lastUpdatedOn: new Date() });
		await sendEmail.resetPasswordEmail(channel.email, passwordString);

		res.json({ message: "Password resetted" });
	} catch (error) {
		next(error);
	}
};

const me = async (req, res, next) => {
	try {
		const { email, createdOn, apiKeys, defaultTags, devices } = req.user;

		res.json({
			email,
			createdOn,
			defaultTags,
			apiKeys,
			pushEnabled: devices.some((d) => d.token === req.token && !!d.pushCredentials),
		});
	} catch (error) {
		next(error);
	}
};

const updateAccount = async (req, res, next) => {
	try {
		const email =
			req.body.email && req.body.email !== req.user.email ? await utils.getValidEmail(req.body.email) : null;
		if (email) await utils.isNewEmail(email, req.user._id);

		const password = req.body.password ? await utils.getValidPassword(req.body.password) : null;

		const defaultTags = req.body.defaultTags ? utils.getValidTags(req.body.defaultTags) : [];

		const updateFields = { defaultTags };
		if (password) updateFields["password"] = password;

		if (email && email !== req.user.email) {
			const emailVerificationCode = uuid();
			updateFields["email"] = email;
			updateFields["emailVerificationCode"] = emailVerificationCode;
			await sendEmail.verificationEmail(email, emailVerificationCode);
		}

		await Users.updateOne({ _id: req.user._id }, { ...updateFields, lastUpdatedOn: new Date() });
		res.json({
			message: `Account updated. ${updateFields["emailVerificationCode"] ? "Please verify your email" : ""}`,
		});
	} catch (error) {
		next(error);
	}
};

const subscribeChannel = async (req, res, next) => {
	try {
	} catch (error) {
		next(error);
	}
};

const unsubscribeChannel = async (req, res, next) => {
	try {
	} catch (error) {
		next(error);
	}
};

const getItems = async (req, res, next) => {
	try {
	} catch (error) {
		next(error);
	}
};

const favouriteItem = async (req, res, next) => {
	try {
	} catch (error) {
		next(error);
	}
};

const unfavouriteItem = async (req, res, next) => {
	try {
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
	subscribeChannel,
	unsubscribeChannel,
	getItems,
	favouriteItem,
	unfavouriteItem,
	logOut,
};
