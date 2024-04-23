/**
 * A singleton implemetaion for the database collections
 */

const mongoose = require("mongoose");
const config = require("./config");

module.exports = (() => {
	let instance;
	let db = mongoose.connection;
	const Schema = mongoose.Schema;

	mongoose.set("strictQuery", true);

	const connectToDb = () => {
		mongoose.connect(config.MONGODB_URI);
	};

	const createInstance = () => {
		db.on("error", (error) => {
			console.error("Error in MongoDb connection: " + error);
			mongoose.disconnect(); // Trigger disconnect on any error
		});
		db.on("connected", () => console.log("Webtag DB connected"));
		db.on("disconnected", () => {
			console.log("MongoDB disconnected!");
			connectToDb();
		});

		connectToDb();

		console.log("Onlie DB initialized");

		const userSchema = new Schema({
			email: { type: String, index: true, unique: true, required: true },
			password: { type: String, required: true },
			emailVerificationCode: { type: String, index: true },
			joinedOn: { type: Date, default: Date.now },
			lastLoginOn: Date,
			lastUpdatedOn: Date,
			token: [{ type: String, index: true }],
			membershipType: { type: String, enum: ["FREE", "PRO"], default: "FREE" },
			channels: [{ type: Schema.Types.ObjectId, ref: "Channels", index: true }],
		});

		const channelSchema = new Schema({
			link: { type: String, index: true, required: true, unique: true },
			feedURL: { type: String, index: true },
			title: String,
			description: String,
			imageURL: String,
			createdOn: { type: Date, default: Date.now },
			lastFetchedOn: Date, // Last successful fetch of the RSS feed
			fetchIntervalInMinutes: { type: Number, default: 30 },
		});

		const itemSchema = new Schema({
			guid: { type: String, index: true, required: true },
			channel: { type: Schema.Types.ObjectId, ref: "Channels", index: true },
			title: String,
			content: String,
			textContent: String,
			author: String,
			publishedOn: Date,
			fetchedOn: Date,
		});
		itemSchema.index({ title: "text", description: "textContent" });

		const Users = mongoose.model("Users", userSchema);
		const Channels = mongoose.model("Channels", channelSchema);
		const Items = mongoose.model("Items", itemSchema);

		return { Channels, Items, Users };
	};
	return {
		getInstance: () => {
			if (!instance) {
				instance = createInstance();
			}
			return instance;
		},
	};
})();
