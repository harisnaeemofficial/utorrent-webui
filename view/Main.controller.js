sap.ui.controller("view.Main", {

	formatterIconButton: function(strIconColor) {
		if (!strIconColor) {
			return "Default";
		}

		var oButton = this.getView().byId("buttonIcon");

		oButton.removeStyleClass("statusIconYellow");
		oButton.removeStyleClass("statusIconGreen");
		oButton.removeStyleClass("statusIconRed");

		switch (strIconColor) {
			case "red":
				oButton.addStyleClass("statusIconRed");

				break;
			case "green":
				oButton.addStyleClass("statusIconGreen");

				break;
			case "yellow":
				oButton.addStyleClass("statusIconYellow");

				break;
			default:
		}

		return "Default";
	},

	/**
	 * Called when a controller is instantiated and its View controls (if available) are already created.
	 * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
	 * @memberOf view.Main
	 */
	onInit: function() {
		jQuery.ajaxSetup({
			cache: true
		});

		var oEventBus = sap.ui.getCore().getEventBus();
		oEventBus.subscribe("app", "load", this.onLoad, this);

		this.oModel = new sap.ui.model.json.JSONModel();
		this.getView().setModel(this.oModel);

		this.oStatusModel = new sap.ui.model.json.JSONModel();
		this.getView().setModel(this.oStatusModel, "status");

		this.oSettingsModel = new sap.ui.model.json.JSONModel();
		this.getView().setModel(this.oSettingsModel, "settings");

		// load settings from localStorage
		this.loadSettings();

		this.changeRemoteMachineStatus("unknown");
		this.queryRemoteServerStatus();
	},

	handleSaveSettings: function() {
		if (!window.localStorage) {
			return;
		}

		window.localStorage.settings = JSON.stringify(this.oSettingsModel.getData());

		this.setupAjaxHeaders();

		alert("Settings saved.");
	},

	loadSettings: function() {
		if (!window.localStorage) {
			alert("No local storage capability. No settings will be loaded/saved.");

			return;
		}

		if (window.localStorage.settings) {
			var settings = JSON.parse(window.localStorage.settings);

			this.oSettingsModel.setData(settings);
			this.setupAjaxHeaders();
		}
	},

	setupAjaxHeaders: function() {
		var oHeaders = {};
		var oSettings = this.oSettingsModel.getData();

		jQuery.each(oSettings, function(strKey, strValue) {
			oHeaders["x-custom-" + strKey] = strValue;
		});

		jQuery.ajaxSetup({
			headers: oHeaders
		});
	},

	onRefresh: function() {
		var oEventBus = sap.ui.getCore().getEventBus();
		oEventBus.publish("app", "load", {});
	},

	onTorrentRemove: function(oEvent) {
		var oList = oEvent.getSource().getParent();
		var oContext = oList.getSwipedItem().getBindingContext();
		var strHash = oContext.getProperty("0");

		jQuery.ajax({
			url: "/gui/?token=" + window.token + "&action=remove&hash=" + strHash + "&t=" + Date.now(),
			//headers: {
			//	"Authorization": window.authorization
			//},
			success: function() {
				this.onRefresh();
			}.bind(this),
			error: function() {
				alert("Request denied");
			}
		});
	},

	onAddUrl: function() {
		var strUrl = this.getView().byId("torrentUrl").getValue();
		this.getView().byId("torrentUrl").setValue("");

		jQuery.ajax({
			url: "/gui/?token=" + window.token + "&action=add-url&s=" + strUrl + "&t=" + Date.now(),
			//headers: {
			//	"Authorization": window.authorization
			//},
			success: function() {
				this.onRefresh();
			}.bind(this),
			error: function() {
				alert("Request denied");
			}
		});
	},

	onLoad: function() {
		this.queryRemoteServerStatus(function() {
			this.queryTorrentList();
		}.bind(this));
	},

	authorization: function(callback) {
		document.cookie = "GUID=;expires=Thu, 01 Jan 1970 00:00:01 GMT;";
		jQuery.ajax({
			url: "/gui/token.html",
			//headers: {
			//	"Authorization": window.authorization
			//},
			success: function(strHtml) {
				window.token = jQuery(strHtml).getEncodedText();

				//this._app.to("idMain");

				var oEventBus = sap.ui.getCore().getEventBus();
				oEventBus.publish("app", "load", {});

				setTimeout(function() {
					if (callback) {
						callback(true);
					}
				}.bind(this));
			}.bind(this),
			error: function() {
				alert("Request denied");

				setTimeout(function() {
					if (callback) {
						callback(false);
					}
				}.bind(this));
			}
		});
	},

	queryTorrentList: function() {
		if (!window.token) {
			this.authorization(function(error) {
				if (!error) {
					setTimeout(function() {
						this.queryTorrentList();
					}.bind(this));
				}
			}.bind(this));

			return;
		}

		jQuery.ajax({
			url: "/gui/?token=" + window.token + "&list=1",
			//headers: {
			//	"Authorization": window.authorization
			//},
			success: function(oData) {
				var oParsedData = JSON.parse(oData);
				oParsedData.downloading = [];

				oParsedData.torrents.forEach(function(torrent, index, arr) {
					if (torrent[21].search("Downloading") > -1 || torrent[21].search("Connecting to peers") > -1) {
						oParsedData.downloading.push(torrent);
						arr.splice(index, 1);
					}
				});

				oParsedData.downloading.sort(function(el1, el2) {
					return el1[2].localeCompare(el2[2]);
				});

				oParsedData.torrents.sort(function(el1, el2) {
					return el1[2].localeCompare(el2[2]);
				});

				this.oModel.setData(oParsedData);

			}.bind(this),
			error: function() {
				alert("Request denied");
			}
		});
	},

	queryRemoteServerStatus: function(callback) {
		jQuery.ajax({
			url: "/ping",
			success: function(strData) {
				var oResponse = strData;

				switch (oResponse.status) {
					case "Error":
						this.changeRemoteMachineStatus("bad");

						setTimeout(function() {
							this.queryRemoteServerStatus();
						}.bind(this), 5000);

						break;
					case "Success":
						this.changeRemoteMachineStatus("good");

						setTimeout(function() {

							if (!window.token) {
								this.authorization();
							}
						}.bind(this));

						setTimeout(function() {
							if (callback) {
								callback();
							}
						}.bind(this));

						break;
					default:
				}
			}.bind(this),
			error: function() {
				this.changeRemoteMachineStatus("bad");
			}.bind(this)
		});
	},

	changeRemoteMachineStatus: function(status) {
		var strIcon = "status-critical";
		var strColor = "yellow";

		var oSegmentedButton = this.getView().byId("segButton");

		if (oSegmentedButton.getBusy()) {
			return;
		}

		switch (status) {
			case "good":
				strIcon = "status-positive";
				strColor = "green";

				oSegmentedButton.setSelectedButton(this.getView().byId("wakeup"));

				break;
			case "bad":
				strIcon = "status-negative";
				strColor = "red";

				oSegmentedButton.setSelectedButton(this.getView().byId("shutdown"));

				break;
			case "unknown":
				strIcon = "status-critical";
				strColor = "yellow";

				oSegmentedButton.setSelectedButton(this.getView().byId("shutdown"));

				break;
			default:
		}

		this.oStatusModel.setProperty("/status", {
			value: status,
			icon: "sap-icon://" + strIcon,
			color: strColor
		});
	},

	handleWakeUp: function(oEvent) {
		var oSegmentedButton = oEvent.getSource().getParent();

		oSegmentedButton.setBusy(true);

		jQuery.ajax({
			url: "/wakeup",
			success: function(strJson) {
				var oResponse = strJson;

				switch (oResponse.statusCode) {
					case 4:
						alert("Request denied");

						break;
					case 0:

						oSegmentedButton.setSelectedButton(this.getView().byId("wakeup"));
						this.changeRemoteMachineStatus("good");
						break;
					default:
				}

				oSegmentedButton.setBusy(false);

			}.bind(this),
			error: function() {
				alert("Request denied");

				oSegmentedButton.setBusy(false);
			}
		});
	},

	handleShutdown: function(oEvent) {
		var oSegmentedButton = oEvent.getSource().getParent();

		oSegmentedButton.setBusy(true);

		jQuery.ajax({
			url: "/shutdown",
			success: function(strJson) {
				var oResponse = strJson;

				switch (oResponse.statusCode) {
					case 4:
						alert("Request denied");

						break;
					case 0:

						oSegmentedButton.setSelectedButton(this.getView().byId("shutdown"));

						this.changeRemoteMachineStatus("bad");
						break;
					default:
				}

				oSegmentedButton.setBusy(false);
			}.bind(this),
			error: function() {
				alert("Request denied");

				oSegmentedButton.setBusy(false);
			}
		});
	}

	/**
	 * Similar to onAfterRendering, but this hook is invoked before the controller's View is re-rendered
	 * (NOT before the first rendering! onInit() is used for that one!).
	 * @memberOf view.Main
	 */
	//	onBeforeRendering: function() {
	//
	//	},

	/**
	 * Called when the View has been rendered (so its HTML is part of the document). Post-rendering manipulations of the HTML could be done here.
	 * This hook is the same one that SAPUI5 controls get after being rendered.
	 * @memberOf view.Main
	 */
	//	onAfterRendering: function() {
	//
	//	},

	/**
	 * Called when the Controller is destroyed. Use this one to free resources and finalize activities.
	 * @memberOf view.Main
	 */
	//	onExit: function() {
	//
	//	}

});