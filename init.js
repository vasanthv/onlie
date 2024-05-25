const express = require("express");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");
const app = express();

const config = require("./src/config");
const apiRoutes = require("./src/routes");
const { initAllChannelsFetch: initScheduler } = require("./src/scheduler");

// Serve vue.js, page.js & axios to the browser
app.use(express.static(path.join(__dirname, "node_modules/axios/dist/")));
app.use(express.static(path.join(__dirname, "node_modules/vue/dist/")));

// Serve frontend assets & images to the browser
app.use(express.static(path.join(__dirname, "static")));
app.use(express.static(path.join(__dirname, "static/icons")));
app.use(express.static(path.join(__dirname, "www"), { maxAge: 0 }));

app.use(morgan("dev")); // for dev logging

// Handle API requests
app.use("/api", apiRoutes);

app.use("/:page", (req, res) => {
	const filePath = path.join(__dirname, `www/${req.params.page}.html`);
	if (!fs.existsSync(filePath)) {
		return res.status(404).sendFile(path.join(__dirname, "www/404.html"));
	}

	res.sendfile(filePath);
});

// Start the server
app.listen(config.PORT, null, function () {
	console.log("Node version", process.version);
	console.log("Onlie server running on port", config.PORT);
});

// Initialize the scheduler for every channel to fetch on a regular interval
initScheduler();
