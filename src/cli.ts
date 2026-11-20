import { Command } from "commander";
import chalk from "chalk";
import { ZynError } from "./lib/store.ts";
import { initCommand } from "./commands/init.ts";
import { logCommand } from "./commands/log.ts";
import { statusCommand } from "./commands/status.ts";

const program = new Command();

program
  .name("zyn")
  .description("Log hours, track monthly income, and generate PDF invoices.")
  .option("-c, --client <key>", "client to use (defaults to config.defaultClient)");

const clientOpt = () => program.opts<{ client?: string }>().client;

program
  .command("init")
  .description("set up your profile and the OnFire client")
  .option("-y, --yes", "write defaults without prompting")
  .action((opts) => initCommand(opts));

program
  .command("log")
  .alias("add")
  .description('log work: interactive, or "zyn log 1.5 Fixed quiz grading -a backend -d 11/3"')
  .argument("[time]", "hours or time range: 1.5, 1h15m, 90m, 10:30am-11:45am")
  .argument("[task...]", "what you did")
  .option("-a, --area <area>", "area (substring match, e.g. backend)")
  .option("-d, --date <date>", "today, yesterday, 11/3, 2026-11-03, mon", "today")
  .action((time, task, opts) => logCommand(time, task, { ...opts, client: clientOpt() }));

program
  .command("status", { isDefault: true })
  .alias("s")
  .description("dashboard of hours and income for a month (default: this month)")
  .argument("[month]", "2026-11, 11, nov, last")
  .action((month) => statusCommand(month, { client: clientOpt() }));

program.parseAsync().catch((err) => {
  if (err instanceof ZynError) {
    console.error(chalk.red(`✖ ${err.message}`));
    process.exit(1);
  }
  throw err;
});
