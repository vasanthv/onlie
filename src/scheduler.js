const { CronJob } = require("cron");

const { Channels, Items, Users } = require("./collections").getInstance();

const rssFetcher = require("./rss-fetcher");
const utils = require("./utils");

const fetchAndUpdateChannelItems = async (_channel) => {
	console.log(`Fetching feed for ${_channel.feedURL}`);
	const { success, error, channel, items } = await rssFetcher(_channel.feedURL);

	if (!success) return console.error(error, _channel.feedURL);

	const newItems = await getNewItems(items);
	const date = new Date();

	const updatePromises = [];

	const channelUpdateFields = { lastFetchedOn: date };
	if (channel.title && _channel.title !== channel.title) channelUpdateFields["title"] = channel.title;
	if (channel.description && _channel.description !== channel.description)
		channelUpdateFields["description"] = channel.description;
	if (channel.imageURL && _channel.imageURL !== channel.imageURL) channelUpdateFields["imageURL"] = channel.imageURL;
	if (channel.link && _channel.link !== channel.link) channelUpdateFields["link"] = channel.link;

	updatePromises.push(Channels.updateOne({ _id: _channel._id }, channelUpdateFields));

	items.forEach((item) => {
		updatePromises.push(
			Items.findOneAndUpdate(
				{ guid: item.guid },
				{ channel: _channel._id, ...item, touchedOn: date },
				{ new: true, upsert: true }
			)
		);
	});

	await Promise.all(updatePromises);
	console.log(`Upserted ${items.length} items for ${channel.title}`, channel.feedURL);
	console.log(`${newItems.length} new items where inserted for ${channel.title}`, channel.feedURL);

	// Send push notification only if there are less than 3 items, else it could be initial fetch and we don't want to send
	// push notification in any initial fetch
	if (newItems.length > 0 && newItems.length <= 3) {
		const usersToBeNotified = await Users.find({
			channels: { $elemMatch: { channel: _channel._id, notification: true } },
		}).exec();
		if (usersToBeNotified.length > 0) {
			const pushPromises = newItems.map((newItem) =>
				utils.sendPushNotification(usersToBeNotified, _channel, newItem.title, newItem.link)
			);
			await Promise.all(pushPromises);
		}
	}
};

const getNewItems = async (items) => {
	try {
		let existingItems = await Items.find({ guid: { $in: items.map((i) => i.guid) } })
			.select("guid")
			.exec();
		existingItems = existingItems.map((i) => i.guid);

		return items.filter((item) => !existingItems.includes(item.guid));
	} catch (err) {
		console.error(err);
	}
};

const initAllChannelsFetch = async () => {
	try {
		// Ignore Channels that did not got updated in the last 30 dates
		const lastMonthDate = new Date();
		lastMonthDate.setDate(lastMonthDate.getDate() - 30);

		const channels = await Channels.find({ lastFetchedOn: { $gte: lastMonthDate } }).exec();

		channels.forEach(scheduleChannelFetch);
	} catch (err) {
		console.error(err);
	}
};

const scheduleChannelFetch = (channel) => {
	try {
		const cronTime = `*/${channel.fetchIntervalInMinutes ?? 60} * * * *`;
		console.log(`Job scheduled for ${channel.feedURL}, runs ${cronTime}`);

		CronJob.from({
			cronTime,
			onTick: () => fetchAndUpdateChannelItems(channel),
			onComplete: () => console.log(`Completed task for ${channel.feedURL}`),
			start: true,
			runOnInit: true,
		});
	} catch (err) {
		console.error(err);
	}
};

module.exports = { initAllChannelsFetch, scheduleChannelFetch };
