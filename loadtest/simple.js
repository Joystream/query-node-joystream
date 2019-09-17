import http from "k6/http";
import { check } from "k6";

export default function() {
    let response = http.post(
		"http://192.168.86.237:4000",
		'{"query":"query { forumCategories { id title }}"}',
		{
			headers: {
				"Accept-Encoding": "gzip, deflate, br",
				"Content-Type": "application/json",
				"Accept": "application/json",
				"Connection": "keep-alive",
				"DNT": "1"
			}
		}
	);

check(response, {
    "response code was 200": (res) => res.status == 200,
    "body size was 386 bytes": (res) => res.body.length == 386,
  });
};
