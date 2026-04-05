#!/usr/bin/env node
import { Command } from 'commander';
import { askCommand } from './commands/ask.js';
import { searchCommand } from './commands/search.js';
import { listCommand } from './commands/list.js';
import { ingestCommand } from './commands/ingest.js';
import { fileCommand } from './commands/file.js';
import { lintCommand } from './commands/lint.js';
import { healCommand } from './commands/heal.js';

const program = new Command();

// INTG-02: Redirect ALL Commander output to stderr.
// Commander by default writes help to stdout — this breaks `wiki search | jq` pipes.
// configureOutput ensures stdout stays clean for machine-readable data only.
program.configureOutput({
  writeOut: (str) => process.stderr.write(str),
  writeErr: (str) => process.stderr.write(str),
  outputError: (str, write) => write(str),
});

program
  .name('wiki')
  .description('Personal LLM knowledge wiki — every question compounds the knowledge base')
  .version('0.1.0');

program.addCommand(askCommand);
program.addCommand(searchCommand);
program.addCommand(listCommand);
program.addCommand(ingestCommand);
program.addCommand(fileCommand);
program.addCommand(lintCommand);
program.addCommand(healCommand);

program.parseAsync(process.argv).catch((err: Error) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
