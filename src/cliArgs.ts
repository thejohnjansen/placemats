export interface CliArgs {
  queryUrl: string;
  out: string;
  reportOnly: boolean;
  oneSlidePerParent: boolean;
}

export function parseArgs(argv: string[]): CliArgs | null {
  const args = argv.slice(2);
  let queryUrl: string | undefined;
  let out: string | undefined;
  let reportOnly = false;
  let oneSlidePerParent = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--out" || arg === "-o") {
      out = args[++i];
      if (!out) throw new Error(`${arg} requires a file path.`);
    } else if (arg === "--report" || arg === "--md") {
      reportOnly = true;
    } else if (arg === "--one-slide-per-parent") {
      oneSlidePerParent = true;
    } else if (arg === "--help" || arg === "-h") {
      return null;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!queryUrl) {
      queryUrl = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!queryUrl) return null;
  return {
    queryUrl,
    out: out ?? (reportOnly ? "scenario-links.md" : "placemat.pptx"),
    reportOnly,
    oneSlidePerParent,
  };
}