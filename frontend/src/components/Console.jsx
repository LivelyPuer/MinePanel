import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { wsURL, getWsTicket } from '../api'

export default function Console({ serverId }) {
  const termRef = useRef(null)
  const terminalRef = useRef(null)
  const wsRef = useRef(null)
  const [command, setCommand] = useState('')

  useEffect(() => {
    const terminal = new Terminal({
      theme: {
        background: '#0a0a0f',
        foreground: '#e8e8f0',
        cursor: '#6c5ce7',
        selectionBackground: 'rgba(108, 92, 231, 0.3)',
        black: '#0a0a0f',
        red: '#ff6b6b',
        green: '#00d68f',
        yellow: '#ffa348',
        blue: '#4facfe',
        magenta: '#6c5ce7',
        cyan: '#4facfe',
        white: '#e8e8f0',
      },
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: false,
      disableStdin: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(termRef.current)
    fitAddon.fit()
    terminalRef.current = terminal

    terminal.writeln('\x1b[90m[MinePanel] Connecting to console...\x1b[0m')

    let ws = null
    let cancelled = false

    const connect = async () => {
      try {
        const { ticket } = await getWsTicket()
        if (cancelled) return
        ws = new WebSocket(wsURL(`/ws/console/${serverId}`, ticket))
        wsRef.current = ws

        ws.onopen = () => {
          terminal.writeln('\x1b[32m[MinePanel] Connected\x1b[0m')
        }

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data)
          if (msg.type === 'log') {
            terminal.writeln(msg.line)
          } else if (msg.type === 'status') {
            const color = msg.status === 'running' ? '32' : msg.status === 'crashed' ? '31' : '90'
            terminal.writeln(`\x1b[${color}m[MinePanel] Server ${msg.status}\x1b[0m`)
          }
        }

        ws.onclose = () => {
          terminal.writeln('\x1b[90m[MinePanel] Disconnected\x1b[0m')
        }

        ws.onerror = () => {
          terminal.writeln('\x1b[31m[MinePanel] Connection error\x1b[0m')
        }
      } catch (err) {
        terminal.writeln('\x1b[31m[MinePanel] Authentication failed\x1b[0m')
      }
    }

    connect()

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      cancelled = true
      window.removeEventListener('resize', handleResize)
      if (ws) ws.close()
      terminal.dispose()
    }
  }, [serverId])

  const sendCommand = (e) => {
    e.preventDefault()
    if (!command.trim() || !wsRef.current) return
    wsRef.current.send(JSON.stringify({ type: 'command', value: command }))
    if (terminalRef.current) {
      terminalRef.current.writeln(`\x1b[36m> ${command}\x1b[0m`)
    }
    setCommand('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div ref={termRef} style={{ flex: 1, minHeight: 400 }} />
      <form onSubmit={sendCommand} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          className="form-input"
          value={command}
          onChange={e => setCommand(e.target.value)}
          placeholder="Type a command..."
          style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 13 }}
        />
        <button type="submit" className="btn btn-primary btn-sm">Send</button>
      </form>
    </div>
  )
}
