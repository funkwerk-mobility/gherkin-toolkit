export type Diagnostic = { path?: string; line?: number; column?: number; rule: string; severity: 'error' | 'warning'; message: string; word?: string };
export type OutputFormat = 'human' | 'json';

export class Reporter {
  private findings: Diagnostic[] = [];
  private total = 0;
  private errors = 0;
  private fixes: string[] = [];
  constructor(private format: OutputFormat, private limit: number) {}
  report(finding: Diagnostic): void {
    this.total++;
    if (finding.severity === 'error') this.errors++;
    if (this.format === 'json' || this.findings.length < this.limit) this.findings.push(finding);
  }
  fixed(message: string): void { this.fixes.push(message); }
  progress(message: string): void {
    if (this.format === 'json') console.error(message); else console.log(message);
  }
  finish(): void {
    const hidden = this.total - this.findings.length;
    if (this.format === 'json') {
      const diagnostics = this.findings.map(finding => {
        const { message: _message, ...structured } = finding;
        return structured;
      });
      console.log(JSON.stringify({ diagnostics, total: this.total, fixes: this.fixes }));
    } else {
      for (const message of this.fixes) console.log(message);
      for (const finding of this.findings) {
        const location = finding.path ? `${finding.path}${finding.line === undefined ? '' : `:${finding.line}:${finding.column ?? 1}`}: ` : '';
        console.error(`${location}${finding.message} [${finding.severity}, ${finding.rule}]`);
      }
      if (hidden) console.error(`${hidden} additional diagnostic${hidden === 1 ? '' : 's'} not shown.`);
    }
    if (this.errors) process.exitCode = 1;
  }
}
