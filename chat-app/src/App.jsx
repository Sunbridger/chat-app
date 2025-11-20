import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';

function App() {
  // 模拟联系人数据
  const [contacts] = useState([
    { id: 1, name: 'AI助手', avatar: '🤖', lastMessage: '你好，我是AI助手', time: '10:30' },
    { id: 2, name: '张三', avatar: '👨', lastMessage: '明天见', time: '昨天' },
    { id: 3, name: '李四', avatar: '👩', lastMessage: '好的，谢谢', time: '星期一' },
  ]);

  // 消息状态
  const [messages, setMessages] = useState([
    { id: 1, contactId: 1, text: '你好，我是AI助手，有什么可以帮助你的吗？', isOwn: false, time: '10:25' },
    { id: 2, contactId: 1, text: '你好！', isOwn: true, time: '10:26' },
  ]);

  const [activeContact, setActiveContact] = useState(1);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 发送消息到Zhipu API的函数（流式）
  async function callZhipuAPI(messages, onChunk, onFinish, onError, model = 'glm-4.5-flash') {
    const url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer f91d39a752ab4a75ac4bdded958db912.mWsOYqcqR3Z6GGMh',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: 0.6,
          stream: true,
        })
      });

      if (!response.ok) {
        throw new Error(`API 调用失败: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data:')) {
              const data = line.substring(5).trim();

              if (data === '[DONE]') {
                onFinish();
                return;
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed.choices && parsed.choices.length > 0) {
                  const content = parsed.choices[0].delta.content;
                  if (content) {
                    onChunk(content);
                  }
                }
              } catch (e) {
                console.warn('解析SSE数据时出错:', e);
              }
            }
          }
        }
      }
    } catch (error) {
      onError(error.message);
    }
  }

  // 处理发送消息
  const handleSend = async () => {
    if (!inputValue.trim()) return;

    // 添加用户消息
    const newUserMessage = {
      id: messages.length + 1,
      contactId: activeContact,
      text: inputValue,
      isOwn: true,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newUserMessage]);
    const currentInputValue = inputValue;
    setInputValue('');

    // 如果是发给AI助手的消息，则调用API
    if (activeContact === 1) {
      // 显示"正在输入"提示
      const typingMessageId = messages.length + 2;
      const typingMessage = {
        id: typingMessageId,
        contactId: activeContact,
        text: '',
        isOwn: false,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        typing: true
      };
      setMessages(prev => [...prev, typingMessage]);

      let accumulatedResponse = '';

      // 更新正在输入的消息内容
      const updateTypingMessage = (content) => {
        accumulatedResponse += content;
        setMessages(prev => prev.map(msg =>
          msg.id === typingMessageId
            ? { ...msg, text: accumulatedResponse }
            : msg
        ));
      };

      // 完成消息接收
      const finishMessage = () => {
        setMessages(prev => prev.filter(msg => msg.id !== typingMessageId));
        const newAiMessage = {
          id: messages.length + 3,
          contactId: activeContact,
          text: accumulatedResponse,
          isOwn: false,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, newAiMessage]);
      };

      // 处理错误
      const handleError = (errorMessage) => {
        setMessages(prev => prev.filter(msg => msg.id !== typingMessageId));
        const errorMessageObj = {
          id: messages.length + 3,
          contactId: activeContact,
          text: `抱歉，消息发送失败：${errorMessage}`,
          isOwn: false,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, errorMessageObj]);
      };

      // 准备消息历史用于API调用
      const conversationHistory = messages
        .filter(msg => msg.contactId === 1)
        .map(msg => ({
          role: msg.isOwn ? 'user' : 'assistant',
          content: msg.text
        }));

      conversationHistory.push({ role: 'user', content: currentInputValue });

      // 调用流式API
      await callZhipuAPI(
        conversationHistory,
        updateTypingMessage,
        finishMessage,
        handleError
      );
    }
  };

  // 处理回车键发送消息
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 获取当前联系人的消息
  const getCurrentMessages = () => {
    return messages.filter(message => message.contactId === activeContact);
  };

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>微信</h2>
        </div>
        <div className="contact-list">
          {contacts.map(contact => (
            <div
              key={contact.id}
              className={`contact-item ${activeContact === contact.id ? 'active' : ''}`}
              onClick={() => setActiveContact(contact.id)}
            >
              <div className="avatar">{contact.avatar}</div>
              <div className="contact-info">
                <h3>{contact.name}</h3>
                <p>{contact.lastMessage}</p>
              </div>
              <div className="contact-time">
                {contact.time}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="chat-container">
        <div className="chat-header">
          <div className="avatar">🤖</div>
          <div className="contact-name">AI助手</div>
        </div>

        <div className="chat-messages">
          {getCurrentMessages().map(message => (
            <div
              key={message.id}
              className={`message ${message.isOwn ? 'own' : 'other'} ${message.typing ? 'typing' : ''}`}
            >
              {!message.isOwn && <div className="avatar">🤖</div>}
              <div className="message-content">
                {message.typing ? (
                  <div className="message-text">
                    <ReactMarkdown components={{
                      a: ({...props}) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                      code: ({className, children, ...props}) => {
                        const match = /language-(\w+)/.exec(className || '')
                        return match ? (
                          <code {...props} className={className}>
                            {children}
                          </code>
                        ) : (
                          <code {...props} className="inline-code">
                            {children}
                          </code>
                        )
                      }
                    }}>
                      {message.text}
                    </ReactMarkdown>
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                ) : (
                  <div className="message-text">
                    {message.isOwn ? (
                      message.text
                    ) : (
                      <ReactMarkdown components={{
                        a: ({...props}) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                        code: ({className, children, ...props}) => {
                          const match = /language-(\w+)/.exec(className || '')
                          return match ? (
                            <code {...props} className={className}>
                              {children}
                            </code>
                          ) : (
                            <code {...props} className="inline-code">
                              {children}
                            </code>
                          )
                        }
                      }}>
                        {message.text}
                      </ReactMarkdown>
                    )}
                  </div>
                )}
                <div className="message-time">{message.time}</div>
              </div>
              {message.isOwn && <div className="avatar">👤</div>}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="输入消息..."
          />
          <button onClick={handleSend}>发送</button>
        </div>
      </div>
    </div>
  );
}

export default App;