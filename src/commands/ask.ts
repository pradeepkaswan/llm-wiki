import { Command } from 'commander';

export const askCommand = new Command('ask')
  .description('Ask a question — answers from wiki or web search (Phase 2+)')
  .argument('<question>', 'the question to ask')
  .action((question: string) => {
    // D-02: all output to stderr; stdout reserved for machine-readable content
    // Note: clack.intro/outro write to stdout by default — using process.stderr.write directly
    process.stderr.write(`wiki ask\n`);
    process.stderr.write(`Question: ${question}\n`);
    process.stderr.write('LLM features available in Phase 2+\n');
    process.stderr.write('Phase 2 will wire real LLM/web search here\n');
    // Nothing written to stdout — stdout stays clean for Phase 6 subprocess use
  });
