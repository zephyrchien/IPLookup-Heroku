import express from "express";
import IP2Region from "node-ip2region";

const app = express();
const query = IP2Region.create();

const TRUE_LOW = ["true", "1"];

function get_client_ip(req) {
	let ip;
	if (req.headers["x-forwarded-for"]) {
		ip = req.headers["x-forwarded-for"].split(",")[0].trim();
	}
	if (!ip) ip = req.socket.remoteAddress;
	return ip;
}

function get_target_opt(form) {
	let target = null;
	const options = {
		all: false,
		isp: false,
		city: false,
		cityid: false,
		country: false,
		region: false,
		province: false,
	};
	for (const key in form) {
		const key_lower = key.toLowerCase();
		if (key_lower == "ip") {
			target = form[key];
			options["all"] = Object.keys(form).length == 1;
		} else {
			options[key_lower] = TRUE_LOW.includes(form[key].toLowerCase());
		}
	}
	console.log(options);
	return { target, options };
}

function filter_result(body, result, options) {
	const cityid = result["city"];
	// country|region|province|city|isp
	const rests = result["region"].split("|");
	body["isp"] = options["all"] || options["isp"] ? rests[4] : null;
	body["city"] = options["all"] || options["city"] ? rests[3] : null;
	body["cityid"] = options["all"] || options["cityid"] ? cityid : null;
	body["country"] = options["all"] || options["country"] ? rests[0] : null;
	body["region"] = options["all"] || options["region"] ? rests[1] : null;
	body["province"] = options["all"] || options["province"] ? rests[2] : null;
}

async function iplookup(ip) {
	return new Promise((resolve, reject) => {
		query.memorySearch(ip, (err, result) => {
			if (err) {
				reject(err);
				return;
			}
			resolve(result);
		});
	});
}

async function handler(req, resp) {
	const client = get_client_ip(req);
	const { target, options } = get_target_opt(
		Object.keys(req.query).length != 0 ? req.query : req.body
	);
	const body = { code: 0, msg: null };
	if (!target) {
		body["msg"] = "no ip specified";
		resp.send(JSON.stringify(body));
		console.log("[" + client + "][?ip=null" + "] failed");
		return;
	}
	let result;
	try {
		result = await iplookup(target);
	} catch (_) {
		body["msg"] = "no such ip in database";
		resp.send(JSON.stringify(body));
		console.log("[" + client + "][?ip=" + target + "] failed");
		return;
	}
	body["code"] = 1;
	filter_result(body, result, options);
	resp.send(
		JSON.stringify(body, (k, v) => {
			if (v !== null) return v;
		})
	);
	console.log("[" + client + "][?ip=" + target + "] done");
}

app.use(express.urlencoded({ extended: true }));
app.get("/", handler);
app.post("/", handler);

app.listen(process.env.PORT, () => console.log("start to serve"));
