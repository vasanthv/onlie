module.exports = {
	NODE_ENV: process.env.NODE_ENV,
	PORT: process.env.PORT || 755,
	PAGE_LIMIT: 50,
	URL: process.env.NODE_ENV === "production" ? "https://onlie.io/" : "http://localhost:3000/",
	MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/onlie-dev",
	DISABLE_CSRF: process.env.DISABLE_CSRF,
	CSRF_TOKEN_EXPIRY: 60 * 30, // 30 mins
	SECRET: process.env.SECRET ?? "some-secret",
	AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY_ID,
	AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
	INVALID_HANDLES: ["administrator", "admin", "bot", "onlie"],
	NO_REPLY_EMAIL: process.env.NO_REPLY_EMAIL ?? "Onlie <noreply@email.onlie.io>",
	CONTACT_EMAIL: process.env.CONTACT_EMAIL ?? "hello@onlie.io",
};
