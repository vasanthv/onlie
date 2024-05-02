/* global page, axios, Vue, cabin */

const initApp = async () => {
	if ("serviceWorker" in navigator) {
		await navigator.serviceWorker.register("/sw.js");
	}
};

const defaultState = function () {
	const searchParams = new URLSearchParams(window.location.search);
	return {
		online: navigator.onLine,
		visible: document.visibilityState === "visible",
		loading: true,
		page: "",
		newAccount: { username: "", email: "", password: "" },
		authCreds: { username: "", password: "" },
		toast: [{ type: "", message: "" }],
		me: { username: "", email: "", password: "" },
		myAccount: {},
		newChannel: "",
		username: window.localStorage.username,
		channels: [],
		items: [],
		query: searchParams.get("q"),
		showLoadMore: false,
	};
};

const App = Vue.createApp({
	data() {
		return defaultState();
	},
	computed: {
		isloggedIn() {
			return !!this.username;
		},
	},
	methods: {
		setNetworkStatus() {
			this.online = navigator.onLine;
		},
		setVisibility() {
			this.visible = document.visibilityState === "visible";
		},
		resetState() {
			const newState = defaultState();
			Object.keys(newState).map((key) => (this[key] = newState[key]));
		},
		setToast(message, type = "error") {
			this.toast = { type, message, time: new Date().getTime() };
			setTimeout(() => {
				if (new Date().getTime() - this.toast.time >= 3000) {
					this.toast.message = "";
				}
			}, 3500);
		},
		userEvent(event) {
			if (cabin) cabin.event(event);
		},
		signUp(e) {
			this.submitHandler(e);
			if (!this.newAccount.username || !this.newAccount.email || !this.newAccount.password) {
				return this.setToast("All fields are mandatory");
			}
			axios.post("/api/signup", this.newAccount).then(this.authenticate);
			this.userEvent("signup");
		},
		signIn(e) {
			this.submitHandler(e);
			if (!this.authCreds.username || !this.authCreds.password) {
				return this.setToast("Please enter valid details");
			}
			axios.post("/api/login", this.authCreds).then(this.authenticate);
			this.userEvent("login");
		},
		forgotPassword() {
			if (!this.authCreds.email) {
				return this.setToast("Please enter your email");
			}
			axios.post("/api/reset", { email: this.authCreds.email }).then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		authenticate(response) {
			window.localStorage.username = this.username = response.data.username;
			this.newAccount = { username: "", email: "", password: "" };
			this.authCreds = { username: "", password: "" };
			page.redirect("/");
			this.setToast(response.data.message, "success");
		},
		getMe(queryParams = "") {
			axios.get(`/api/me${queryParams}`).then((response) => {
				window.localStorage.username = this.username = response.data.username;
				this.me = { ...this.me, ...response.data };
				this.myAccount = { ...this.me };
			});
		},
		updateAccount(e) {
			this.submitHandler(e);
			const { username, email, password } = this.myAccount;
			axios.put("/api/account", { username, email, password }).then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		getChannels() {
			this.loading = true;
			axios
				.get("/api/channels")
				.then((response) => {
					this.channels = response.data.channels;
				})
				.finally(() => {
					this.loading = false;
				});
		},
		getItems() {
			this.loading = true;
			const params = { q: this.query };
			if (this.items.length > 0) {
				params["skip"] = this.items.length;
			}
			axios
				.get("/api/items", { params })
				.then((response) => {
					if (response.data.items.length > 0) {
						response.data.items.forEach((m) => this.items.push(m));
					}
					this.showLoadMore = response.data.items.length == 50;
				})
				.finally(() => {
					this.loading = false;
				});
		},
		subscribeChannel(e) {
			this.submitHandler(e);
			axios.post("/api/channels/subscribe", { url: this.newChannel }).then((response) => {
				this.setToast(response.data.message, "success");
				this.getChannels();
				this.newChannel = "";
			});
		},
		unsubscribeChannel(channelId) {
			axios.post("/api/channels/unsubscribe", { channelId }).then((response) => {
				this.setToast(response.data.message, "success");
				this.getChannels();
			});
		},
		submitHandler(e) {
			e.preventDefault();
			e.stopPropagation();
		},
		search() {
			const url = new URL(window.location);
			if (this.query) url.searchParams.set("q", this.query);
			else url.searchParams.delete("q");

			history.pushState({}, "", url);
			this.items = [];
			this.getItems();
		},
		clearSearch() {
			// This method is used only when clearing the search box
			// as search event is not available in all browsers
			if (!this.query) {
				this.search();
			}
		},
		displayDate(datestring) {
			const seconds = Math.floor((new Date() - new Date(datestring)) / 1000);
			let interval = seconds / 31536000;
			if (interval > 1) return Math.floor(interval) + "Y";
			interval = seconds / 2592000;
			if (interval > 1) return Math.floor(interval) + "M";
			interval = seconds / 86400;
			if (interval > 1) return Math.floor(interval) + "d";
			interval = seconds / 3600;
			if (interval > 1) return Math.floor(interval) + "h";
			interval = seconds / 60;
			if (interval > 1) return Math.floor(interval) + "m";
			return "now";
		},
		logOut(autoSignOut) {
			const localClear = () => {
				window.localStorage.clear();
				this.resetState();
				page.redirect("/");
			};
			if (autoSignOut || confirm("Are you sure, you want to log out?")) axios.post("/api/logout").finally(localClear);
		},
		logError(message, source, lineno, colno) {
			const error = { message, source, lineno, colno, username: this.username, page: this.page };
			axios.post("/api/error", { error }).then(() => {});
			return true;
		},
	},
}).mount("#app");

window.addEventListener("online", App.setNetworkStatus);
window.addEventListener("offline", App.setNetworkStatus);
document.addEventListener("visibilitychange", App.setVisibility);
window.onerror = App.logError;

(() => {
	if (window.CSRF_TOKEN) {
		axios.defaults.headers.common["x-csrf-token"] = window.CSRF_TOKEN;
	}

	axios.interceptors.request.use((config) => {
		window.cancelRequestController = new AbortController();
		return { ...config, signal: window.cancelRequestController.signal };
	});

	axios.interceptors.response.use(
		(response) => response,
		(error) => {
			console.log(error);
			if (error.request.responseURL.endsWith("api/me") && error.response.status === 401) {
				return App.logOut(true);
			}
			App.setToast(error.response.data.message || "Something went wrong. Please try again");
			throw error;
		}
	);
	initApp();
})();

page("*", (ctx, next) => {
	// resetting state on any page load
	App.resetState();
	if (window.cancelRequestController) {
		window.cancelRequestController.abort();
	}
	if (App.isloggedIn) App.getMe();
	next();
});

/* Routes declaration */
page("/", (ctx) => {
	document.title = "Onlie - Read all your news, social media & blogs in a single feed.";
	App.page = App.isloggedIn ? "home" : "intro";

	if (App.isloggedIn) {
		const urlParams = new URLSearchParams(ctx.querystring);
		App.query = urlParams.get("q");
		App.getItems();
	}
});

page("/signup", () => {
	document.title = "Sign up: Onlie";
	if (App.isloggedIn) return page.redirect("/");
	else App.page = "signup";
});

page("/login", () => {
	document.title = "Log in: Onlie";
	if (App.isloggedIn) return page.redirect("/");
	else App.page = "login";
});

page("/channels", () => {
	document.title = "Channels: Onlie";
	if (!App.isloggedIn) return page.redirect("/login");
	App.page = "channels";
	App.getChannels();
});

page("/account", () => {
	document.title = "My acount: Onlie";
	if (!App.isloggedIn) return page.redirect("/login");
	App.page = "account";
	App.getMe();
});

page("/*", () => {
	document.title = "Page not found: Onlie";
	App.page = "404";
});

page();
