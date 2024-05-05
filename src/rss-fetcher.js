const Parser = require("rss-parser");
const domPurify = require("isomorphic-dompurify");

const parser = new Parser();
/**
 * This function uses the `rss-parser` to fetch the RSS feed and converts them to a format that can be inserted into the Onlie database
 * @param  {string} feedURL - URL of the RSS feed.
 * @return {object} A stripped down version of the feed & items from the RSS feed
 */
const rssFetcher = async (feedURL) => {
	try {
		const feed = await parser.parseURL(feedURL);

		const channel = {};
		channel["title"] = feed.title;
		channel["description"] = feed.description;
		channel["link"] = feed.link;
		channel["feedURL"] = feed.feedURL ?? feedURL;
		channel["imageURL"] = feed.image?.url;

		//Get only the first 100 elements of the rss feed
		const _items = feed.items.slice(0, 100);
		const items = _items.map((_item) => {
			const item = {};
			item["guid"] = _item.guid ?? _item.id ?? _item.link;
			item["link"] = _item.link;
			item["title"] = (_item.title ?? _item.contentSnippet ?? "Untitled").substr(0, 160);
			item["content"] = _item.content ? domPurify.sanitize(_item.content) : undefined;
			item["textContent"] = _item.contentSnippet;
			item["author"] = _item.author;
			item["publishedOn"] = new Date(_item.isoDate);
			return item;
		});
		return { success: true, channel, items };
	} catch (err) {
		console.error(err);
		return { success: false, error: err.message };
	}
};

module.exports = rssFetcher;
