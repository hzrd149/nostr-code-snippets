import { Command } from "commander";

export interface BaseCommand {
  name: string;
  description: string;
  setup(program: Command): void;
}

export interface CodeSnippet {
  id: string;
  content: string;
  language?: string;
  title?: string;
  tags: string[];
  author: string;
  createdAt: Date;
  nostrEventId?: string;
}
