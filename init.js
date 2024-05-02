// const rssFetcher = require("./src/rss-fetcher.js");

// rssFetcher("https://chaos.social/@gsuberland.rss").then(console.log);

const express = require("express");
const dotenv = require("dotenv");
const morgan = require("morgan");
const path = require("path");
const app = express();

// Load emvironment variables
dotenv.config({ path: path.join(__dirname, ".env") });

const config = require("./src/config");
const apiRoutes = require("./src/routes");
const { initAllChannelsFetch: initScheduler } = require("./src/scheduler");

// Set the view engine
app.set("view engine", "ejs");

// Serve vue.js, page.js & axios to the browser
app.use(express.static(path.join(__dirname, "node_modules/axios/dist/")));
app.use(express.static(path.join(__dirname, "node_modules/vue/dist/")));
app.use(express.static(path.join(__dirname, "node_modules/page/")));

// Serve frontend assets & images to the browser
app.use(express.static(path.join(__dirname, "static")));
app.use(express.static(path.join(__dirname, "static/icons")));
app.use(express.static(path.join(__dirname, "www"), { maxAge: 0 }));

// Handle API requests
app.use(morgan("dev")); // for dev logging

app.use("/api", apiRoutes);

// app.use(["/", "/read", "/signup", "/login", "/account", "/@:user/:list"], (req, res) =>
// 	res.sendFile(path.join(__dirname, "www/index.html"))
// );

app.use("/*", (req, res) => res.sendFile(path.join(__dirname, "www/index.html")));

// Start the server
app.listen(config.PORT, null, function () {
	console.log("Node version", process.version);
	console.log("Onlie server running on port", config.PORT);
});

// Initialize the scheduler for every channel to fetch on a regular interval
initScheduler();
