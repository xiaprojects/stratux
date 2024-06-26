angular.module('appControllers').controller('TrafficCtrl', TrafficCtrl); // get the main module contollers set
TrafficCtrl.$inject = ['$rootScope', '$scope', '$state', '$http', '$interval', 'craftService']; // Inject my dependencies


// create our controller function with all necessary logic
function TrafficCtrl($rootScope, $scope, $state, $http, $interval, craftService) {

	$scope.$parent.helppage = 'plates/traffic-help.html';
	$scope.data_list = [];
	$scope.data_list_invalid = [];

	$scope.$parent.esStyleColor = craftService.getTrafficSourceColor(1);
	$scope.$parent.uatStyleColor = craftService.getTrafficSourceColor(2);
	$scope.$parent.ognStyleColor = craftService.getTrafficSourceColor(4);
	$scope.$parent.aisStyleColor = craftService.getTrafficSourceColor(5);
	
	function utcTimeString(epoc) {
		var time = "";
		var val;
		var d = new Date(epoc);
		val = d.getUTCHours();
		time += (val < 10 ? "0" + val : "" + val);
		val = d.getUTCMinutes();
		time += ":" + (val < 10 ? "0" + val : "" + val);
		val = d.getUTCSeconds();
		time += ":" + (val < 10 ? "0" + val : "" + val);
		time += "Z";
		return time;
	}	
/*

	function dmsString(val) {
		return [0 | val,
				'° ',
				0 | (val < 0 ? val = -val : val) % 1 * 60,
				"' ",
				0 | val * 60 % 1 * 60,
				'"'].join('');
	}
*/

// chop off seconds for space
	function dmsString(val) {
		var deg;
		var min;
		deg = 0 | val;
		min = 0 | (val < 0 ? val = -val : val) % 1 * 60;
		
		return [deg*deg < 100 ? "0" + deg : deg,
				'° ',
				min < 10 ? "0" + min : min,
				"' "].join('');
	}

	function setAircraft(obj, new_traffic) {
		new_traffic.icao_int = obj.Icao_addr;
		new_traffic.isStratux = obj.IsStratux;
		new_traffic.signal = obj.SignalLevel;
		new_traffic.Last_source = obj.Last_source; // 1=ES, 2=UAT, 4=OGN, 8=AIS
		new_traffic.Emitter_category = obj.Emitter_category;
		//console.log('Emitter Category:' + obj.Emitter_category);
		
		new_traffic.icao = obj.Icao_addr.toString(16).toUpperCase();
		new_traffic.tail = obj.Tail;
		if (!new_traffic.tail || new_traffic.tail.trim().length == 0)
			new_traffic.tail = "[--N/A--]";

		new_traffic.reg = obj.Reg;
		if (!new_traffic.reg || new_traffic.reg.trim().length == 0)
			new_traffic.reg = "[--N/A--]";

		if (obj.Squawk == 0) {
			new_traffic.squawk = "----";
		} else {
			new_traffic.squawk = obj.Squawk;
		}
		new_traffic.addr_type = obj.Addr_type;
		new_traffic.lat = dmsString(obj.Lat);
		new_traffic.lon = dmsString(obj.Lng);
		var n = Math.round(obj.Alt / 25) * 25;
		new_traffic.alt = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		var s = Math.round(obj.Speed / 5) * 5;
		if (obj.Speed_valid) {
			new_traffic.speed = s.toString();
			new_traffic.heading = Math.round(obj.Track / 5) * 5;
		} else {
			new_traffic.speed = "---";
			new_traffic.heading = "---";
		}
		new_traffic.vspeed = Math.round(obj.Vvel / 100) * 100
		var timestamp = Date.parse(obj.Timestamp);
		new_traffic.time = utcTimeString(timestamp);
		new_traffic.Age = obj.Age;
		new_traffic.AgeLastAlt = obj.AgeLastAlt;
		new_traffic.bearing = Math.round(obj.Bearing); // degrees true 
		new_traffic.dist = obj.Distance / 1852; // nautical miles
		new_traffic.distEst = obj.DistanceEstimated / 1852;
		new_traffic.trafficColor = craftService.getTransportColor(obj);
		new_traffic.category = craftService.getCategory(obj);
		if (new_traffic.TargetType ===  TARGET_TYPE_AIS) {
			new_traffic.addr_symb = '\uD83D\uDEA2';
		} else {
			new_traffic.addr_symb ='\u2708';    // undefined, use aircraft as default
			if (new_traffic.targettype > 3) {
				new_traffic.addr_symb ='\ud83d\udce1';
			}
		}
		// return new_aircraft;
	}


	function isSameAircraft(addr1, addrType1, addr2, addrType2) {
		if (addr1 != addr2)
			return false;
		// Both aircraft have the same address and it is either an ICAO address for both,
		// or a non-icao address for both.
		// 1 = non-icao, everything else = icao
		if ((addrType1 == 1 && addrType2 == 1) || (addrType1 != 1 && addrType2 != 1))
			return true;
	}


	function connect($scope) {
		if (($scope === undefined) || ($scope === null))
			return; // we are getting called once after clicking away from the status page

		if (($scope.socket === undefined) || ($scope.socket === null)) {
			socket = new WebSocket(URL_TRAFFIC_WS);
			$scope.socket = socket; // store socket in scope for enter/exit usage
		}

		$scope.ConnectState = "Disconnected";

		socket.onopen = function (msg) {
			// $scope.ConnectStyle = "label-success";
			$scope.ConnectState = "Connected";
		};

		socket.onclose = function (msg) {
			// $scope.ConnectStyle = "label-danger";
			$scope.ConnectState = "Disconnected";
			$scope.$apply();
			setTimeout(connect, 1000);
		};

		socket.onerror = function (msg) {
			// $scope.ConnectStyle = "label-danger";
			$scope.ConnectState = "Problem";
			$scope.$apply();
		};

		socket.onmessage = function (msg) {
			//console.log('Received traffic update.')
			var message = JSON.parse(msg.data);
			$scope.raw_data = angular.toJson(msg.data, true);

			// we need to use an array so AngularJS can perform sorting; it also means we need to loop to find an aircraft in the traffic set
			var validIdx = -1;
			var invalidIdx = -1;
			for (var i = 0, len = $scope.data_list.length; i < len; i++) {
				if (isSameAircraft($scope.data_list[i].icao_int, $scope.data_list[i].addr_type, message.Icao_addr, message.Addr_type)) {
					setAircraft(message, $scope.data_list[i]);
					validIdx = i;
					break;
				}
			}
			
			for (var i = 0, len = $scope.data_list_invalid.length; i < len; i++) {
				if (isSameAircraft($scope.data_list_invalid[i].icao_int, $scope.data_list_invalid[i].addr_type, message.Icao_addr, message.Addr_type)) {
					setAircraft(message, $scope.data_list_invalid[i]);
					invalidIdx = i;
					break;
				}
			}
			
			if ((validIdx < 0) && (message.Position_valid)) {
				var new_traffic = {};
				setAircraft(message, new_traffic);
				$scope.data_list.unshift(new_traffic); // add to start of valid array.
			}

			if ((invalidIdx < 0) && (!message.Position_valid)) {
				var new_traffic = {};
				setAircraft(message, new_traffic);
				$scope.data_list_invalid.unshift(new_traffic); // add to start of invalid array.
			}

			// Handle the negative cases of those above - where an aircraft moves from "valid" to "invalid" or vice-versa.
			if ((validIdx >= 0) && !message.Position_valid) {
				// Position is not valid any more. Remove from "valid" table.
				$scope.data_list.splice(validIdx, 1);
			}

			if ((invalidIdx >= 0) && message.Position_valid) {
				// Position is now valid. Remove from "invalid" table.
				$scope.data_list_invalid.splice(invalidIdx, 1);
			}

			$scope.$apply();

		};
	}

	var getClock = $interval(function () {
		$http.get(URL_STATUS_GET).
		then(function (response) {
			globalStatus = angular.fromJson(response.data);
				
			var tempClock = new Date(Date.parse(globalStatus.Clock));
			var clockString = tempClock.toUTCString();
			$scope.Clock = clockString;

			var tempUptimeClock = new Date(Date.parse(globalStatus.UptimeClock));
			var uptimeClockString = tempUptimeClock.toUTCString();
			$scope.UptimeClock = uptimeClockString;

			var tempLocalClock = new Date;
			$scope.LocalClock = tempLocalClock.toUTCString();
			$scope.SecondsFast = (tempClock-tempLocalClock)/1000;
			
			$scope.GPS_connected = globalStatus.GPS_connected;
						
		}, function (response) {
			// nop
		});
	}, 500, 0, false);
		

	// perform cleanup every 10 seconds
	var clearStaleTraffic = $interval(function () {
		// remove stale aircraft = anything more than cutoff seconds without a position update

		// Clean up "valid position" table.
		for (var i = $scope.data_list.length; i > 0; i--) {
			if (craftService.isTrafficAged($scope.data_list[i - 1])) {
				$scope.data_list.splice(i - 1, 1);
			}
		}

		// Clean up "invalid position" table.
		for (var i = $scope.data_list_invalid.length; i > 0; i--) {			
			if (craftService.isTrafficAged($scope.data_list_invalid[i - 1]) || craftService.isTrafficAged2($scope.data_list_invalid[i - 1], 'AgeLastAlt')) {
				$scope.data_list_invalid.splice(i - 1, 1);
			}
		}
	}, (1000 * 10), 0, false);


	$state.get('traffic').onEnter = function () {
		// everything gets handled correctly by the controller
	};

	$state.get('traffic').onExit = function () {
		// disconnect from the socket
		if (($scope.socket !== undefined) && ($scope.socket !== null)) {
			$scope.socket.close();
			$scope.socket = null;
		}
		// stop stale traffic cleanup
		$interval.cancel(clearStaleTraffic);
		$interval.cancel(getClock);
	};

	// Traffic Controller tasks
	connect($scope); // connect - opens a socket and listens for messages
};
