const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');

async function testMCP() {
  const mcpProcess = spawn('node', [path.join(__dirname, '..', 'bin', 'mcp.js')], {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  const responses = [];
  let buffer = '';

  mcpProcess.stdout.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep partial line
    for (const line of lines) {
      if (line.trim()) {
        try {
          responses.push(JSON.parse(line));
        } catch (_) {}
      }
    }
  });

  function send(msg) {
    mcpProcess.stdin.write(JSON.stringify(msg) + '\n');
  }

  function waitForResponse(id) {
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        const found = responses.find(r => r.id === id);
        if (found) {
          clearInterval(interval);
          resolve(found);
        }
      }, 20);
      setTimeout(() => {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for response to id ${id}`));
      }, 3000);
    });
  }

  // 1. Initialize
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  const initRes = await waitForResponse(1);
  assert(initRes.result, 'Initialize should return result');
  assert.strictEqual(initRes.result.serverInfo.name, 'repoguard-mcp');
  assert.strictEqual(initRes.result.serverInfo.version, '1.7.0');
  assert(initRes.result.capabilities.tools, 'Should declare tools capability');
  assert(initRes.result.capabilities.resources, 'Should declare resources capability');
  assert(initRes.result.capabilities.prompts, 'Should declare prompts capability');

  // 2. Ping
  send({ jsonrpc: '2.0', id: 2, method: 'ping' });
  const pingRes = await waitForResponse(2);
  assert.deepStrictEqual(pingRes.result, {});

  // 3. Tools list
  send({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  const toolsRes = await waitForResponse(3);
  assert.strictEqual(toolsRes.result.tools.length, 4, 'Should expose 4 tools');
  const toolNames = toolsRes.result.tools.map(t => t.name);
  assert(toolNames.includes('repoguard_audit'));
  assert(toolNames.includes('repoguard_diff'));
  assert(toolNames.includes('repoguard_get_rules'));
  assert(toolNames.includes('repoguard_fix'));

  // 4. Tools call (repoguard_get_rules)
  send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'repoguard_get_rules' } });
  const callRulesRes = await waitForResponse(4);
  assert(callRulesRes.result.content[0].text.includes('16 active'), 'Should list 16 active rules');

  // 5. Tools call (repoguard_fix with Rust .unwrap())
  send({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'repoguard_fix',
      arguments: {
        code: 'let val = option.unwrap();',
        filename: 'src/handler.rs'
      }
    }
  });
  const fixRes = await waitForResponse(5);
  assert(fixRes.result.content[0].text.includes('RULE-RS-01'), 'Should detect RULE-RS-01 in snippet');

  // 6. Resources list
  send({ jsonrpc: '2.0', id: 6, method: 'resources/list' });
  const resList = await waitForResponse(6);
  assert(resList.result.resources.length >= 2, 'Should expose at least 2 resources');
  const uris = resList.result.resources.map(r => r.uri);
  assert(uris.includes('repoguard://rules'));
  assert(uris.includes('repoguard://health'));

  // 7. Resources read (repoguard://rules)
  send({ jsonrpc: '2.0', id: 7, method: 'resources/read', params: { uri: 'repoguard://rules' } });
  const readRes = await waitForResponse(7);
  const rulesJson = JSON.parse(readRes.result.contents[0].text);
  assert.strictEqual(rulesJson.length, 16, 'Resource read should return 16 rules JSON');

  // 8. Prompts list
  send({ jsonrpc: '2.0', id: 8, method: 'prompts/list' });
  const promptList = await waitForResponse(8);
  assert(promptList.result.prompts.length >= 2, 'Should expose at least 2 prompts');
  const promptNames = promptList.result.prompts.map(p => p.name);
  assert(promptNames.includes('architectural_review'));
  assert(promptNames.includes('clean_architecture_refactor'));

  // 9. Prompts get
  send({
    jsonrpc: '2.0',
    id: 9,
    method: 'prompts/get',
    params: {
      name: 'architectural_review',
      arguments: { diff: '+ pub fn test() { val.unwrap(); }' }
    }
  });
  const promptGet = await waitForResponse(9);
  assert(promptGet.result.messages[0].content.text.includes('16 Architectural Guardrails'));

  mcpProcess.kill();
  console.log('✅ All MCP Server 2.0 (Tools + Resources + Prompts) tests passed successfully!');
}

testMCP().catch(err => {
  console.error('MCP Test Failed:', err);
  process.exit(1);
});
