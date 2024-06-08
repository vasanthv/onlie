const mongoStore = require("connect-mongo");
const session = require("express-session");
const router = require("express").Router();
const bodyParser = require("body-parser");
const morgan = require("morgan");
const uuid = require("uuid").v4;

const config = require("./config");
const model = require("./model");
const utils = require("./utils");

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));
router.use(morgan("dev")); // for dev logging

router.use(
	session({
		secret: config.SECRET,
		store: mongoStore.create({ mongoUrl: config.MONGODB_URI }),
		cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 },
		resave: true,
		saveUninitialized: true,
	})
);

// Keys for push notifications
router.get("/meta", (req, res) => res.json({ vapidKey: config.PUSH_OPTIONS.vapidDetails.publicKey }));

// Logging UI errors
router.post("/error", (req, res) => {
	console.error({ browserError: req.body });
	res.send();
});

// Basic CSRF implementation
// TODO: Replace with other better npm packages if available
router.get("/csrf.js", async (req, res) => {
	let csrfs = [...(req.session.csrfs ? req.session.csrfs : [])];
	const currentTimeInSeconds = new Date().getTime() / 1000;

	const csrfToken = uuid();
	csrfs.push({ token: csrfToken, expiry: currentTimeInSeconds + config.CSRF_TOKEN_EXPIRY });
	csrfs = csrfs.filter((csrf) => csrf.expiry > currentTimeInSeconds);

	req.session.csrfs = csrfs;
	res.send(`window.CSRF_TOKEN="${csrfToken}"`);
});

router.use(utils.csrfValidator);

router.post("/auth", utils.rateLimit({ windowMs: 15, max: 5, skipFailedRequests: true }), model.authenticate);

router.use(utils.attachUsertoRequest);
router.use(utils.isUserAuthed);

router.get("/me", model.me);

router.put("/credentials", model.updatePushCredentials);

router.post("/channels/subscribe", utils.canUserSubscribe, model.subscribeChannel);
router.post("/channels/unsubscribe", model.unsubscribeChannel);

router.put("/channels/notification/enable", model.enableNotification);
router.put("/channels/notification/disable", model.disableNotification);
router.get("/items", model.getItems);

router.post("/logout", model.logOut);

/**
 * API endpoints common error handling middleware
 */
router.use(["/:404", "/"], (req, res) => {
	res.status(404).json({ message: "ROUTE_NOT_FOUND" });
});

// Username the known errors
router.use((err, req, res, next) => {
	if (err.httpErrorCode) {
		res.status(err.httpErrorCode).json({ message: err.message || "Something went wrong" });
	} else {
		next(err);
	}
});

// Username the unknown errors
router.use((err, req, res, next) => {
	console.error(err);
	res.status(500).json({ message: "Something went wrong" });
});

module.exports = router;
