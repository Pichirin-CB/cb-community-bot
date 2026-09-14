async function main() {
  const searchUrl = new URL(
    "https://store.steampowered.com/search/results/",
  );

  searchUrl.searchParams.set("query", "");
  searchUrl.searchParams.set("start", "0");
  searchUrl.searchParams.set("count", "50");
  searchUrl.searchParams.set("maxprice", "0");
  searchUrl.searchParams.set("specials", "1");
  searchUrl.searchParams.set("category1", "998");
  searchUrl.searchParams.set("hidef2p", "1");
  searchUrl.searchParams.set("json", "1");

  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36",
      Accept: "application/json,text/javascript,*/*;q=0.8",
      Referer: "https://store.steampowered.com/",
    },
  });

  const data = await response.json();

  console.log("SEARCH HTTP:", response.status);
  console.log("CANDIDATES:", data.items?.length ?? 0);
  console.log("");

  const items = Array.isArray(data.items) ? data.items : [];

  for (const item of items.slice(0, 10)) {
    const match = String(item.logo ?? "").match(/\/apps\/(\d+)\//);

    if (!match) {
      console.log("SIN APPID:", item.name);
      continue;
    }

    const appId = Number(match[1]);

    const appUrl =
      `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&l=en`;

    const appResponse = await fetch(appUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });

    const appData = await appResponse.json();
    const entry = appData[String(appId)];

    const details = entry?.success ? entry.data : null;

    console.log("────────────────────────────────────");
    console.log("NAME:", item.name);
    console.log("APPID:", appId);
    console.log("SUCCESS:", entry?.success ?? false);

    if (!details) {
      console.log("NO DETAILS");
      continue;
    }

    console.log("TYPE:", details.type);
    console.log("IS_FREE:", details.is_free);
    console.log(
      "INITIAL:",
      details.price_overview?.initial ?? null,
    );
    console.log(
      "FINAL:",
      details.price_overview?.final ?? null,
    );
    console.log(
      "DISCOUNT:",
      details.price_overview?.discount_percent ?? null,
    );
    console.log(
      "CURRENCY:",
      details.price_overview?.currency ?? null,
    );
  }
}

main().catch((error) => {
  console.error("ERROR:", error);
  process.exit(1);
});