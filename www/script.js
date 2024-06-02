/* global page, axios, Vue, cabin */

const defaultState = function () {
	const searchParams = new URLSearchParams(window.location.search);
	return {
		online: navigator.onLine,
		visible: document.visibilityState === "visible",
		loading: true,
		page: "", // intro | otp | feed | settings
		auth: { email: "", otp: "" },
		userEmail: window.localStorage.email,
		toast: [{ type: "", message: "" }],
		newChannel: "",
		me: {},
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
		isLoggedIn() {
			return !!this.userEmail;
		},
		isValidAuthEmail() {
			var re = /\S+@\S+\.\S+/;
			return re.test(this.auth.email);
		},
		pageTitle() {
			switch (this.page) {
				case "otp":
					return "OTP";
				case "feed":
					return "Feed";
				case "settings":
					return "Settings";
				default:
					return "Onlie";
			}
		},
		pageDesc() {
			if (this.channels.length === 0 && this.page === "feed") {
				return "Read all your news, social media & blogs in a single feed. Start adding channels by clicking the logo.";
			} else if (this.page === "otp") {
				return `We have sent an one-time password to your email "${this.auth.email}", use that to sign in.`;
			} else return;
		},
	},
	methods: {
		initApp() {
			this.page = this.isLoggedIn ? "feed" : "intro";

			// register service worker
			if ("serviceWorker" in navigator) {
				navigator.serviceWorker.register("/sw.js");
			}
			if (this.page === "feed") {
				this.loadFeeds();
			}
		},
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
		sendOTP() {
			// this.submitHandler(e);
			if (!this.isValidAuthEmail) return this.setToast("Please enter a valid email.");

			axios.post("/api/auth", { email: this.auth.email }).then(() => (this.page = "otp"));
		},
		signIn() {
			// this.submitHandler(e);
			if (!this.isValidAuthEmail) return this.setToast("Please enter a valid email.");
			if (!this.auth.otp) return this.setToast("Please enter a valid OTP.");

			axios.post("/api/auth", this.auth).then(this.authenticate);
			this.userEvent("authenticated");
		},
		authenticate(response) {
			window.localStorage.email = this.userEmail = response.data.email;
			this.auth = { email: "", otp: "" };
			this.setToast(response.data.message, "success");
			this.page = "feed";
			this.loadFeeds();
		},
		loadFeeds() {
			this.getMe();
			this.getItems();
		},
		getMe() {
			axios.get("/api/me").then((response) => {
				const { channels, ...me } = response.data;
				window.localStorage.email = this.userEmail = me.email;
				this.channels = channels;
				this.me = me;
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
				.finally(() => (this.loading = false));
		},
		subscribeChannel(e) {
			this.submitHandler(e);
			axios.post("/api/channels/subscribe", { url: this.newChannel }).then((response) => {
				this.setToast(response.data.message, "success");
				this.getMe();
				this.newChannel = "";
			});
		},
		unsubscribeChannel(channelId) {
			axios.post("/api/channels/unsubscribe", { channelId }).then((response) => {
				this.setToast(response.data.message, "success");
				this.getMe();
			});
		},
		submitHandler(e) {
			e.preventDefault();
			e.stopPropagation();
		},
		logoClickHandler() {
			let page = "intro";
			switch (this.page) {
				case "otp":
					page = "intro";
					break;
				case "feed":
					page = "settings";
					break;
				case "settings":
					page = "feed";
					break;
				default:
					page = "intro";
			}
			this.page = page;
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
		displayDate(input) {
			const date = input instanceof Date ? input : new Date(input);
			const formatter = new Intl.RelativeTimeFormat("en");
			const ranges = {
				years: 3600 * 24 * 365,
				months: 3600 * 24 * 30,
				weeks: 3600 * 24 * 7,
				days: 3600 * 24,
				hours: 3600,
				minutes: 60,
				seconds: 1,
			};
			const secondsElapsed = (date.getTime() - Date.now()) / 1000;
			for (let key in ranges) {
				if (ranges[key] < Math.abs(secondsElapsed)) {
					const delta = secondsElapsed / ranges[key];
					return formatter.format(Math.round(delta), key);
				}
			}
		},
		displayURL(_url) {
			let url = _url.replace(/^https?:\/\//i, "");
			url = url.length > 30 ? `${url.substr(0, 30)}...` : url;
			return url;
		},
		logOut(autoSignOut) {
			const localClear = () => {
				window.localStorage.clear();
				this.resetState();
				this.page = "intro";
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

window.onscroll = () => {
	const flowerEle = document.querySelector("#flower img");
	if (flowerEle) {
		const scrollPercentage =
			((document.documentElement.scrollTop + document.body.scrollTop) /
				(document.documentElement.scrollHeight - document.documentElement.clientHeight)) *
			100;
		const flowerScale = (scrollPercentage / 100) * 3 + 1;
		const flowerOpacity = Math.abs(scrollPercentage / 100 - 1);
		flowerEle.style.transform = `rotate(${scrollPercentage}deg) scale(${flowerScale})`;
		flowerEle.style.opacity = flowerOpacity;
	}
};

(() => {
	if (window.CSRF_TOKEN) {
		axios.defaults.headers.common["x-csrf-token"] = window.CSRF_TOKEN;
	}

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
	App.initApp();
})();
