# zynvoice

`zyn` is a personal CLI for logging hours, watching monthly income, and generating PDF invoices that match the OnFire Learning invoice layout.

## Setup

```sh
npm install
npm link          # puts `zyn` on your PATH
zyn init          # your name/address/phone + the OnFire client at $55/hr
```

PDFs are rendered with your installed Google Chrome. Set `ZYNVOICE_CHROME` to use a different browser binary.

## Daily use

```sh
zyn log                                       # interactive: date, time, area, task, repeat
zyn log 10:30am-11:45am Fixed quiz grading -a backend
zyn log 1.5 "Guardian labels" -a web -d yesterday
zyn                                           # this month's dashboard (same as `zyn status`)
zyn s last                                    # last month's dashboard
zyn ls                                        # table of every entry
zyn edit                                      # pick an entry to edit, duplicate, or delete
zyn edit --raw                                # edit the month's JSON in $EDITOR
```

Times can be ranges (`10:30am-11:45am`, `6:25pm-7:26`, `9-11:30pm`) or durations (`1.5`, `2h`, `1h15m`, `90m`). Dates accept `today`, `yesterday`, `11/3`, `2026-11-03`, `7` (day of this month), or a weekday such as `mon`. `-a` matches an area by name, so `backend`, `web` and `mobile` are enough.

## Invoicing

```sh
zyn invoice              # prompts for line item titles, invoice #, dates, adjustments
zyn invoice oct --yes    # no prompts, using saved titles and defaults
zyn invoice --html       # HTML preview, useful while working on a template
```

Entries are grouped into line items by period: 1-10, 11-20 and 21 to the end of the month, as in the reference invoice. Within each line item, tasks are grouped under their area heading. PDFs are written to `~/.zynvoice/invoices/<client>/`, each with a JSON snapshot of what was billed. The invoice number advances automatically.

## Who you bill as

Sender details come from a **profile**, and each **client** picks one:

```sh
zyn profile                         # list profiles (aiden, onesource)
zyn profile edit aiden              # name, address, phone, email, payment notes
zyn client bill-as onfire aiden     # OnFire invoices come from Aiden McGuire
zyn client bill-as onfire onesource # ...or back to OneSource, LLC
```

The profile supplies the purple header name, the address and phone block, and the "Payable to" line. "Invoice for" stays set to the client's `billTo`, for example Kenneth Grover and OnFire Learning.

## Other clients

```sh
zyn client add                  # name, bill-to, rate, sender profile, areas, periods, template
zyn client use acme             # make it the default
zyn log 2 "Hero section" -c acme
zyn invoice -c acme
```

Set periods to `monthly` for a single line item per invoice.

## Templates

Templates live in `templates/<name>/invoice.hbs` and `style.css`, using Handlebars. A folder with the same name in `~/.zynvoice/templates/` overrides the built-in one. To make a new design, copy `templates/classic`, edit it, and choose it with `zyn client edit`. `npm run sample -- <template>` renders the October reference invoice to `out/sample.pdf` so you can compare it with the original.

## Data

Everything lives in `~/.zynvoice`. Set `ZYNVOICE_HOME` to change the location.

```
config.json                 profiles, clients, rates, next invoice numbers
logs/<client>/YYYY-MM.json  entries and period titles
invoices/<client>/          generated PDFs and JSON snapshots
```

## Development

```sh
npm test          # node:test suite
npm run typecheck
```
