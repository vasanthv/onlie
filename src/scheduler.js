const cron = require("node-cron");

const { Channels, Items } = require("./collections").getInstance();

const rssFetcher = require("./rss-fetcher");

const fetchAndUpdateChannelItems = async (_channel) => {
	console.log(`Fetching feed for ${_channel.feedURL}`);
	const { success, error, channel, items } = await rssFetcher(_channel.feedURL);
	console.log({ success, error, channel, items, _channel });

	if (!success) return console.error(error, _channel.feedURL);

	const date = new Date();

	const updatePromises = [];

	const channelUpdateFields = { lastFetchedOn: date };
	if (channel.title && _channel.title !== channel.title) channelUpdateFields["title"] = channel.title;
	if (channel.description && _channel.description !== channel.description)
		channelUpdateFields["description"] = channel.description;
	if (channel.imageURL && _channel.imageURL !== channel.imageURL) channelUpdateFields["imageURL"] = channel.imageURL;
	if (channel.link && _channel.link !== channel.link) channelUpdateFields["link"] = channel.link;

	updatePromises.push(Channels.updateOne({ _id: channel._id }, channelUpdateFields));

	items.forEach((item) => {
		updatePromises.push(
			Items.findOneAndUpdate(
				{ guid: item.guid },
				{ channel: channel._id, ...item, fetchedOn: date },
				{ new: true, upsert: true }
			)
		);
	});

	await Promise.all(updatePromises);
	console.log(`Completed scheduled task for ${channel.feedURL}`);
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
		const cronInterval = `*/${channel.fetchIntervalInMinutes ?? 60} * * * *`;
		console.log(`Job scheduled for ${channel.feedURL}, runs every ${cronInterval}`);
		const updateChannelFeed = async () => {
			try {
				console.log(`running the scheduled task for ${channel.feedURL}`);
				await fetchAndUpdateChannelItems(channel);
			} catch (err) {
				console.error(err);
			}
		};
		cron.schedule(cronInterval, updateChannelFeed);
	} catch (err) {
		console.error(err);
	}
};

module.exports = { initAllChannelsFetch, scheduleChannelFetch };
