import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Html } from '@react-three/drei'
import type { NetClient } from './net/NetClient'

/** Speech bubble floating above a player's head. Pass id=null for yourself. */
export function ChatBubble({
  client,
  id,
  y,
}: {
  client: NetClient
  id: string | null
  y: number
}) {
  useSyncExternalStore(client.subscribe, client.getChatKey)

  const key = id ?? client.getMyId()
  const bubble = key ? client.bubbles.get(key) : undefined
  if (!bubble || bubble.until < Date.now()) return null

  return (
    <Html position={[0, y, 0]} center distanceFactor={9} zIndexRange={[4, 0]}>
      <div
        style={{
          maxWidth: 220,
          padding: '6px 12px',
          color: '#111',
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: 14,
          fontSize: 15,
          lineHeight: 1.25,
          fontFamily: 'Arial, sans-serif',
          textAlign: 'center',
          wordBreak: 'break-word',
          pointerEvents: 'none',
          userSelect: 'none',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        }}
      >
        {bubble.text}
      </div>
    </Html>
  )
}

/** On-screen chat log and input. Press Enter to type, Enter to send, Esc to cancel. */
export function ChatBox({ client }: { client: NetClient }) {
  useSyncExternalStore(client.subscribe, client.getChatKey)

  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState('')

  const messages = client.chatLog.slice(-8)
  const myId = client.getMyId()

  // Keep the newest message in view
  useEffect(() => {
    list.current?.scrollTo(0, list.current.scrollHeight)
  })

  // Enter opens the chat box from anywhere in the game
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.defaultPrevented) return
      if ((event.target as HTMLElement).tagName === 'INPUT') return

      event.preventDefault()
      input.current?.focus()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      const message = text.trim()
      if (message) client.sendChat(message)
      setText('')
      input.current?.blur()
    } else if (event.key === 'Escape') {
      setText('')
      input.current?.blur()
    }
  }

  return (
    <div className={`chat ${focused ? 'chat-focused' : ''}`}>
      <div className="chat-log" ref={list}>
        {messages.map((message, index) => (
          <div
            key={`${message.at}-${index}`}
            className={message.id ? 'chat-line' : 'chat-line chat-system'}
          >
            {message.id ? (
              <>
                <b className={message.id === myId ? 'chat-me' : undefined}>
                  {message.name}
                </b>{' '}
                {message.text}
              </>
            ) : (
              message.text
            )}
          </div>
        ))}
      </div>

      <input
        ref={input}
        className="chat-input"
        value={text}
        maxLength={140}
        placeholder="Press Enter to chat"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  )
}
