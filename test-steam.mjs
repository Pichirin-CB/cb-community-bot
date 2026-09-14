async function main() {
  const url =
    "https://store.steampowered.com/search/?maxprice=free&specials=1&hidef2p=1&ndl=1";

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  console.log("HTTP:", response.status);
  console.log("TYPE:", response.headers.get("content-type"));

  const html = await response.text();

  console.log("LENGTH:", html.length);

  const matches = html.match(/data-ds-appid=["'](\d+)["']/gi) || [];

  const appIds = matches
    .slice(0, 20)
    .map((value) => value.match(/\d+/)?.[0])
    .filter(Boolean);

  console.log("APP IDS:", appIds);
}

main().catch((error) => {
  console.error("ERROR:", error);
  process.exit(1);
});