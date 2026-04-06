import OpenAI from "openai";
import * as fs from 'fs';
import { $ } from "bun";

interface Message {
  role: string;
  tool_call_id: string | null;
  content: string;
}

const messages: Message[] = [];


async function main() {
  const [, , flag, prompt] = process.argv;
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseURL =
    process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  if (flag !== "-p" || !prompt) {
    throw new Error("error: -p flag is required");
  }

  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
  });
  
  const messages: Message[] = [{role: 'user', tool_call_id: null ,content: prompt}];
  while (true) {
    const response = await client.chat.completions.create({
      model: "anthropic/claude-haiku-4.5",
      messages: messages,
      tools: [{
        type: "function",
        function: {
          name: "Read",
          description: "Read and return the contents of a file",
          parameters: {
            type: "object",
            properties: {
              file_path: { type: "string", description: "The path to the file to read" }
            },
            required: ["file_path"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "Write",
          description: "Write content to a file",
          parameters: {
            type: "object",
            required: ["file_path", "content"],
            properties: {
              file_path: {
                type: "string",
                description: "The path of the file to write to"
              },
              content: {
                type: "string",
                description: "The content to write to the file"
              }
            }
          }
        }
        },
        {
          type: "function",
          function: {
            name: "Bash",
            description: "Execute a shell command",
            parameters: {
              type: "object",
              required: ["command"],
              properties: {
                command: {
                  type: "string",
                  description: "The command to execute"
                }
              }
            }
          }
        }]
    });
  
    const assMsg = response.choices[0].message;
    messages.push(assMsg as Message);
  
    const tool_calls = assMsg.tool_calls;
  
    if (tool_calls && tool_calls.length > 0) {
      for (const tool_call of tool_calls) {
        const args = JSON.parse(tool_call.function.arguments);
        const content = args.content
        if (tool_call.function.name === 'Read') {
          const file = fs.readFileSync(args.file_path, 'utf-8');
          messages.push({
            role: 'tool',
            tool_call_id: tool_call.id, 
            content: file
          });
        }
        else if (tool_call.function.name === 'Write') {
          if (args.file_path && args.file_path === null) {
            const file = fs.writeFileSync(args.file_path, content)
            messages.push({
              role: 'tool',
              tool_call_id: tool_call.id, 
              content: 'Content written successfully'
            });
          }
          else {
            const file = fs.writeFileSync(args.file_path, content, 'utf8');
            messages.push({
              role: 'tool',
              tool_call_id: tool_call.id, 
              content: 'Content written successfully'
            });
          }
        }
        else if (tool_call.function.name === 'Bash') {
          const command = args.command
          const result = await $`${{ raw: command }}`.quiet();
          if (result.stdout) {
            console.log(result.stdout.toString())
            messages.push({
              role: 'tool',
              tool_call_id: tool_call.id, 
              content: result.stdout.toString()
            });
          }
          else {
            console.log(result.stderr)
            messages.push({
              role: 'tool',
              tool_call_id: tool_call.id, 
              content: result.stderr.toString()
            });
          }
        }
      }
    } else {
      console.log(assMsg.content);
      break;
    }
  }
}

main();
