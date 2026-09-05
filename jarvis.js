#!/usr/bin/env node
/* ==========================================================================
   JARVIS - Voice AI Assistant

   Part of Karan Chief Operator ecosystem
   Handles voice commands, AI processing, and task execution
   ========================================================================== */

const http = require('http');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '8001');
const KARAN_API = process.env.KARAN_API || 'http://localhost:9000';

let STATE = {
  voiceSessions: {},
  commands: [],
  settings: {}
};

function uid() { return crypto.randomBytes(16).toString('hex'); }

// Parse voice command
async function parseVoiceCommand(text) {
  const lower = text.toLowerCase();

  const commands = {
    'create': { action: 'create_task', confidence: 0.9 },
    'remind': { action: 'set_reminder', confidence: 0.9 },
    'remind me': { action: 'set_reminder', confidence: 0.95 },
    'schedule': { action: 'schedule_event', confidence: 0.85 },
    'check': { action: 'check_status', confidence: 0.8 },
    'list': { action: 'list_items', confidence: 0.8 },
    'what': { action: 'query_info', confidence: 0.75 },
    'how': { action: 'query_info', confidence: 0.75 },
    'who': { action: 'query_info', confidence: 0.75 },
    'cancel': { action: 'cancel_task', confidence: 0.9 },
    'stop': { action: 'stop_action', confidence: 0.9 },
    'help': { action: 'show_help', confidence: 0.95 }
  };

  for (const [keyword, cmd] of Object.entries(commands)) {
    if (lower.includes(keyword)) {
      return { command: cmd.action, confidence: cmd.confidence, text };
    }
  }

  return { command: 'general_query', confidence: 0.6, text };
}

// Process voice command
async function processVoiceCommand(sessionId, command) {
  const parsed = await parseVoiceCommand(command.text);

  let response = {
    id: uid(),
    sessionId,
    input: command.text,
    command: parsed.command,
    confidence: parsed.confidence,
    output: '',
    timestamp: Date.now()
  };

  try {
    switch (parsed.command) {
      case 'create_task':
        response.output = `Creating task: ${command.text.replace('create', '').trim()}`;
        break;
      case 'set_reminder':
        response.output = `Setting reminder for: ${command.text}`;
        break;
      case 'schedule_event':
        response.output = `Scheduling event: ${command.text}`;
        break;
      case 'check_status':
        response.output = `Checking status... Systems operational`;
        break;
      case 'list_items':
        response.output = `Fetching your items...`;
        break;
      case 'query_info':
        response.output = `Information: ${command.text}`;
        break;
      case 'cancel_task':
        response.output = `Canceling task...`;
        break;
      case 'stop_action':
        response.output = `Stopping...`;
        break;
      case 'show_help':
        response.output = `I can help with: tasks, reminders, scheduling, status checks, and more. Try saying "create a task"`;
        break;
      default:
        response.output = `Processing: ${command.text}`;
    }
  } catch (e) {
    response.output = `Error processing command: ${e.message}`;
    response.error = true;
  }

  // Send to Karan for integration
  try {
    await sendToKaran(sessionId, response);
  } catch (e) {
    console.error('Failed to send to Karan:', e.message);
  }

  return response;
}

// Send command result to Karan
async function sendToKaran(sessionId, response) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      type: 'voice_command',
      data: response
    });

    const karanUrl = new URL(`${KARAN_API}/api/voice?sessionId=${sessionId}`);
    const req = http.request({
      hostname: karanUrl.hostname,
      port: karanUrl.port || 80,
      path: karanUrl.pathname + karanUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => resolve(buf));
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const method = req.method;

    // Health check
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, service: 'jarvis' }));
    }

    // Voice command
    if (url.pathname === '/api/voice' && method === 'POST') {
      const sessionId = url.searchParams.get('sessionId');
      let body = '';

      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { text } = JSON.parse(body);
          const response = await processVoiceCommand(sessionId, { text });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, response }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });

      return;
    }

    // List commands
    if (url.pathname === '/api/commands' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        commands: [
          'Create a task',
          'Set a reminder',
          'Schedule an event',
          'Check status',
          'List my items',
          'What is...',
          'Cancel task',
          'Help'
        ]
      }));
    }

    // Wake word detection
    if (url.pathname === '/api/wake' && method === 'POST') {
      const sessionId = uid();
      STATE.voiceSessions[sessionId] = {
        id: sessionId,
        active: true,
        startTime: Date.now()
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true,
        sessionId,
        message: 'Jarvis activated. Listening...'
      }));
    }

    // Close session
    if (url.pathname === '/api/wake/end' && method === 'POST') {
      const sessionId = url.searchParams.get('sessionId');
      if (STATE.voiceSessions[sessionId]) {
        delete STATE.voiceSessions[sessionId];
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }

    // Settings
    if (url.pathname === '/api/settings' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        language: 'en-US',
        wakeWord: 'Jarvis',
        voiceSpeed: 1.0,
        volume: 0.8
      }));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('   JARVIS - Voice AI Assistant');
  console.log('════════════════════════════════════════════════════════\n');
  console.log(`   RUNNING ON:  http://localhost:${PORT}`);
  console.log(`   INTEGRATION: Karan Chief Operator`);
  console.log('\n   Available Commands:');
  console.log('   • "Create a task..."');
  console.log('   • "Remind me to..."');
  console.log('   • "Schedule an event"');
  console.log('   • "Check status"');
  console.log('   • "List my items"');
  console.log('\n════════════════════════════════════════════════════════\n');
});

process.on('SIGTERM', () => {
  console.log('[shutdown] Jarvis shutting down...');
  setTimeout(() => process.exit(0), 1000);
});
