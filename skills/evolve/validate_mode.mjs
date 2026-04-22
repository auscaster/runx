const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");
const terminate = String(inputs.terminate || "spec");

if (terminate !== "spec") {
  console.error(
    `evolve currently stops at spec. Received terminate=${terminate}. `
    + "Plan the change with runx evolve, then execute it through a real skill or governed lane.",
  );
  process.exit(1);
}
