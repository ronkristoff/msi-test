console.log("MSITest Runner started");

process.on("SIGINT", () => {
  console.log("Runner shutting down");
  process.exit(0);
});
