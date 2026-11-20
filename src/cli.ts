import { Command } from "commander";
import chalk from "chalk";
import { ZynError } from "./lib/store.ts";
import { initCommand } from "./commands/init.ts";
import { logCommand } from "./commands/log.ts";
import { salaryCommand, statusCommand } from "./commands/status.ts";
import { listCommand } from "./commands/list.ts";
import { editCommand } from "./commands/edit.ts";
import { invoiceCommand } from "./commands/invoice.ts";
import {
  clientAddCommand,
  clientBillAsCommand,
  clientEditCommand,
  clientListCommand,
  clientUseCommand,
} from "./commands/client.ts";
import { profileAddCommand, profileEditCommand, profileListCommand } from "./commands/profile.ts";
import { gitListCommand, gitSetupCommand } from "./commands/git.ts";

process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

const program = new Command();

program
  .name("zyn")
  .description("Log hours, track monthly income, and generate PDF invoices.")
  .option("-c, --client <key>", "client to use (defaults to config.defaultClient)")
  .option("-s, --salary", 'add your monthly salary to the dashboard (set it with "zyn salary")')
  .option("--no-anim", "skip the dashboard count-up animation");

const clientOpt = () => program.opts<{ client?: string }>().client;
const statusOpts = () => {
  const o = program.opts<{ client?: string; salary?: boolean; anim?: boolean }>();
  return { client: o.client, salary: o.salary, anim: o.anim };
};

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
  .action((month) => statusCommand(month, statusOpts()));

program
  .command("salary")
  .description("show or set your monthly salary, used by zyn -s")
  .argument("[amount]", "e.g. 6000")
  .action((amount) => salaryCommand(amount));

program
  .command("list")
  .alias("ls")
  .description("table of every entry in a month")
  .argument("[month]", "2026-11, 11, nov, last")
  .action((month) => listCommand(month, { client: clientOpt() }));

program
  .command("edit")
  .description("edit, duplicate, delete, or add entries and period titles")
  .argument("[month]", "2026-11, 11, nov, last")
  .option("--raw", "open the month's JSON file in $EDITOR")
  .action((month, opts) => editCommand(month, { ...opts, client: clientOpt() }));

program
  .command("invoice")
  .alias("inv")
  .description("generate the PDF invoice for a month")
  .argument("[month]", "2026-11, 11, nov, last (default: the month you're most likely billing)")
  .option("-y, --yes", "skip prompts; use saved titles and defaults")
  .option("-n, --number <n>", "invoice number (default: next in sequence)")
  .option("--date <date>", "invoice date (default: 1st of the next month)")
  .option("--due <due>", 'due date: 12/15, +15, or "--"')
  .option("--adjust <amount>", "adjustment amount, negative for a discount")
  .option("-o, --out <dir>", "output folder (default: ~/.zynvoice/invoices/<client>)")
  .option("--html", "write an HTML preview instead of a PDF")
  .option("--no-open", "don't open the file when done")
  .action((month, opts) => invoiceCommand(month, { ...opts, client: clientOpt() }));

const gitCmd = program.command("git").description("recent branches and commits from your repos");
gitCmd
  .command("list", { isDefault: true })
  .alias("ls")
  .description("your branches and commits, with days you haven't logged")
  .option("--days <n>", "how far back to look", "14")
  .option("--no-fetch", "skip git fetch")
  .action((opts) => gitListCommand({ ...opts, client: clientOpt() }));
gitCmd
  .command("setup")
  .description("choose repos, author emails, and folder-to-area rules")
  .option("-y, --yes", "use the OnFire defaults (spark-lms)")
  .action((opts) => gitSetupCommand({ ...opts, client: clientOpt() }));

const client = program.command("client").description("clients you invoice (templates for billing other people)");
client.command("list", { isDefault: true }).alias("ls").description("list clients").action(() => clientListCommand());
client.command("add").argument("[key]").description("add a client").action((key) => clientAddCommand(key));
client.command("edit").argument("[key]").description("edit a client (default: the default client)").action((key) => clientEditCommand(key));
client.command("use").argument("<key>").description("set the default client").action((key) => clientUseCommand(key));
client
  .command("bill-as")
  .argument("<client>")
  .argument("<profile>")
  .description("switch which sender profile a client is billed from")
  .action((key, profile) => clientBillAsCommand(key, profile));

const profile = program.command("profile").description("who invoices are from (name, address, phone)");
profile.command("list", { isDefault: true }).alias("ls").description("list sender profiles").action(() => profileListCommand());
profile.command("add").argument("[key]").description("add a sender profile").action((key) => profileAddCommand(key));
profile.command("edit").argument("[key]").description("edit a sender profile").action((key) => profileEditCommand(key));

program.parseAsync().catch((err) => {
  if (err instanceof ZynError) {
    console.error(chalk.red(`✖ ${err.message}`));
    process.exit(1);
  }
  throw err;
});
