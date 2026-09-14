async function main() {
  const url =
    "https://store.steampowered.com/api/featuredcategories/?cc=us&l=english";

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36",
      Accept: "application/json",
    },
  });

  console.log("HTTP:", response.status);
  console.log("TYPE:", response.headers.get("content-type"));

  const data = await response.json();

  console.log("");
  console.log("CATEGORIAS:", Object.keys(data));

  const specials = data.specials;

  console.log("");
  console.log("SPECIALS EXISTE:", Boolean(specials));

  if (!specials) {
    console.log("Steam no devolvio la categoria specials.");
    console.log("");
    console.log("Respuesta parcial:");
    console.log(JSON.stringify(data, null, 2).slice(0, 5000));
    return;
  }

  console.log("SPECIALS NAME:", specials.name);
  console.log("SPECIALS ITEMS:", specials.items?.length ?? 0);
  console.log("");

  for (const item of (specials.items ?? []).slice(0, 20)) {
    console.log("────────────────────────────────────");
    console.log("NAME:", item.name);
    console.log("ID:", item.id ?? "N/A");
    console.log("URL:", item.url ?? "N/A");
    console.log("DISCOUNT:", item.discount_percent ?? "N/A");
    console.log("FINAL:", item.final_price ?? "N/A");
    console.log("ORIGINAL:", item.original_price ?? "N/A");
    console.log(
      "EXPIRATION:",
      item.discount_expiration ?? "N/A",
    );
  }
}

main().catch((error) => {
  console.error("ERROR:", error);
  process.exit(1);
});