"use client";

import { useState, useEffect, useRef } from "react";
import {
  Send,
  Bot,
  Sparkles,
  Zap,
  Brain,
  Star,
  Infinity,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Github,
} from "lucide-react";

export default function AIComparisonApp() {
  const [prompt, setPrompt] = useState("");
  const [conversations, setConversations] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [messageReactions, setMessageReactions] = useState({});
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const chatRefs = useRef({});

  const aiModels = [
    {
      id: "chatgpt",
      name: "ChatGPT",
      provider: "OpenAI",
      icon: Bot,
      color: "#00D4AA",
      gradient: "linear-gradient(135deg, #00D4AA 0%, #00B4D8 100%)",
      accentColor: "#00D4AA",
    },
    {
      id: "claude-sonnet-35",
      name: "Claude Sonnet 3.5",
      provider: "Anthropic",
      icon: Star,
      color: "#FF8A65",
      gradient: "linear-gradient(135deg, #FF8A65 0%, #FFAB91 100%)",
      accentColor: "#FF8A65",
    },
    {
      id: "claude-opus-41",
      name: "Claude Opus 4.1",
      provider: "Anthropic",
      icon: Sparkles,
      color: "#9C88FF",
      gradient: "linear-gradient(135deg, #9C88FF 0%, #B39DDB 100%)",
      accentColor: "#9C88FF",
    },
    {
      id: "gemini-25-pro",
      name: "Gemini 2.5 Pro",
      provider: "Google",
      icon: Brain,
      color: "#42A5F5",
      gradient: "linear-gradient(135deg, #42A5F5 0%, #66BB6A 100%)",
      accentColor: "#42A5F5",
    },
    {
      id: "grok-4",
      name: "Grok 4",
      provider: "xAI",
      icon: Zap,
      color: "#26C6DA",
      gradient: "linear-gradient(135deg, #26C6DA 0%, #4DD0E1 100%)",
      accentColor: "#26C6DA",
    },
    {
      id: "openai-o3",
      name: "OpenAI o3",
      provider: "OpenAI",
      icon: Infinity,
      color: "#FF7043",
      gradient: "linear-gradient(135deg, #FF7043 0%, #FFAB91 100%)",
      accentColor: "#FF7043",
    },
  ];

  // Auto-scroll to bottom when conversations update
  useEffect(() => {
    aiModels.forEach((model) => {
      const chatRef = chatRefs.current[model.id];
      if (chatRef) {
        chatRef.scrollTop = chatRef.scrollHeight;
      }
    });
  }, [conversations, isLoading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;

    const currentPrompt = prompt;
    setPrompt("");
    setIsLoading(true);

    // Add user message to all conversations
    const userMessage = {
      type: "user",
      content: currentPrompt,
      timestamp: Date.now(),
    };
    const newConversations = { ...conversations };

    aiModels.forEach((model) => {
      if (!newConversations[model.id]) {
        newConversations[model.id] = [];
      }
      newConversations[model.id] = [...newConversations[model.id], userMessage];
    });
    setConversations(newConversations);

    try {
      const response = await fetch("/compare-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: currentPrompt }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();

      const updatedConversations = { ...newConversations };
      aiModels.forEach((model) => {
        const modelResponse = data.responses[model.id];
        const aiMessage = {
          type: "ai",
          content: modelResponse?.response || "No response received",
          timestamp: Date.now(),
          responseTime: modelResponse?.responseTime,
          error: modelResponse?.error || false,
        };
        updatedConversations[model.id] = [
          ...updatedConversations[model.id],
          aiMessage,
        ];
      });

      setConversations(updatedConversations);
    } catch (error) {
      console.error("Error comparing AI models:", error);

      const errorConversations = { ...newConversations };
      aiModels.forEach((model) => {
        const errorMessage = {
          type: "ai",
          content: "Error: Could not fetch response from this model.",
          timestamp: Date.now(),
          error: true,
        };
        errorConversations[model.id] = [
          ...errorConversations[model.id],
          errorMessage,
        ];
      });
      setConversations(errorConversations);
    } finally {
      setIsLoading(false);
    }
  };

  const clearAll = () => {
    setConversations({});
  };

  // Handle message reactions
  const handleReaction = (modelId, messageIndex, reaction) => {
    const messageId = `${modelId}-${messageIndex}`;
    setMessageReactions((prev) => ({
      ...prev,
      [messageId]: prev[messageId] === reaction ? null : reaction,
    }));
  };

  // Handle copy message
  const handleCopyMessage = async (content, modelId, messageIndex) => {
    try {
      await navigator.clipboard.writeText(content);
      const messageId = `${modelId}-${messageIndex}`;
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error("Failed to copy message:", error);
    }
  };

  return (
    <div className="h-screen flex flex-col font-inter relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-100/30 via-violet-100/30 to-orange-100/30"></div>
        <div className="absolute top-0 left-1/4 w-72 h-72 bg-gradient-to-br from-blue-200/20 to-purple-200/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-gradient-to-br from-pink-200/20 to-orange-200/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] bg-gradient-to-br from-lavender-200/10 to-peach-200/10 rounded-full blur-3xl"></div>
      </div>

      {/* Glassmorphism Header */}
      <header className="relative z-10 backdrop-blur-xl bg-white/20 border border-white/30 shadow-lg rounded-3xl mx-3 mt-3">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-bold text-xl text-gray-800 tracking-tight">
                AI Model Comparison
              </h1>
              <p className="text-xs text-gray-600 mt-1 font-medium">
                Compare responses from multiple AI models side-by-side
              </p>
            </div>

            <div className="flex items-center gap-3">
              <a
                href="https://github.com/iiioooiso/Multimodal-Adversarial-AI"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 text-xs font-semibold flex items-center gap-1 text-gray-700 hover:text-gray-900 bg-white/30 hover:bg-white/50 backdrop-blur-sm rounded-xl transition-all duration-300 shadow-md hover:shadow-lg border border-white/40"
              >
                <Github size={14} /> GitHub
              </a>
              <button
                onClick={clearAll}
                className="px-4 py-2 text-xs font-semibold text-gray-700 hover:text-gray-900 bg-white/30 hover:bg-white/50 backdrop-blur-sm rounded-xl transition-all duration-300 shadow-md hover:shadow-lg border border-white/40"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Chat Columns Container */}
      <div className="flex-1 flex overflow-x-auto md:overflow-hidden relative z-10 p-3 gap-3 scrollbar-hide">
        {aiModels.map((model) => {
          const IconComponent = model.icon;
          const conversation = conversations[model.id] || [];

          return (
            <div
              key={model.id}
              className="flex-none md:flex-1 flex flex-col bg-white/20 backdrop-blur-xl rounded-2xl shadow-xl border border-white/30 overflow-hidden w-[90%] sm:w-[70%] md:w-auto"
            >
              {/* Model Header */}
              <div className="p-4 bg-white/30 backdrop-blur-sm border-b border-white/20">
                <div className="flex items-center space-x-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md"
                    style={{
                      background: model.gradient,
                      boxShadow: `0 6px 20px ${model.accentColor}20`,
                    }}
                  >
                    <IconComponent size={16} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-gray-800 truncate">
                      {model.name}
                    </h3>
                    <p className="text-xs text-gray-600 truncate font-medium">
                      {model.provider}
                    </p>
                  </div>
                </div>
              </div>

              {/* Chat Messages */}
              <div
                ref={(el) => (chatRefs.current[model.id] = el)}
                className="flex-1 overflow-y-auto p-4 space-y-3"
                style={{
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                  scrollBehavior: "smooth",
                  willChange: "scroll-position",
                  transform: "translateZ(0)",
                }}
              >
                {conversation.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 shadow-lg"
                      style={{
                        background: model.gradient,
                        boxShadow: `0 8px 25px ${model.accentColor}25`,
                      }}
                    >
                      <IconComponent size={18} className="text-white" />
                    </div>
                    <p className="text-xs text-gray-500 font-medium">
                      Start a conversation with {model.name}
                    </p>
                  </div>
                ) : (
                  conversation.map((message, messageIndex) => (
                    <div
                      key={messageIndex}
                      className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {message.type === "ai" ? (
                        <div className="max-w-[85%] group">
                          <div
                            className={`rounded-xl p-3 shadow-sm transition-transform ${message.error
                              ? "bg-red-50 border border-red-200 text-red-700"
                              : "bg-white/80 text-gray-800 border border-white/60"
                              }`}
                          >
                            <div className="text-xs leading-relaxed whitespace-pre-wrap font-medium">
                              {message.content}
                            </div>
                            {message.responseTime && (
                              <div className="mt-2 text-[10px] opacity-60 font-semibold">
                                {message.responseTime}ms
                              </div>
                            )}
                          </div>
                          {!message.error && (
                            <div className="flex items-center space-x-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <button
                                onClick={() =>
                                  handleReaction(model.id, messageIndex, "thumbs-up")
                                }
                                className={`p-1.5 rounded-lg text-xs transition-all duration-200 hover:bg-white/50 ${messageReactions[`${model.id}-${messageIndex}`] === "thumbs-up"
                                  ? "bg-green-100 text-green-600"
                                  : "text-gray-500 hover:text-green-600"
                                  }`}
                                title="Thumbs up"
                              >
                                <ThumbsUp size={12} />
                              </button>
                              <button
                                onClick={() =>
                                  handleReaction(model.id, messageIndex, "thumbs-down")
                                }
                                className={`p-1.5 rounded-lg text-xs transition-all duration-200 hover:bg-white/50 ${messageReactions[`${model.id}-${messageIndex}`] === "thumbs-down"
                                  ? "bg-red-100 text-red-600"
                                  : "text-gray-500 hover:text-red-600"
                                  }`}
                                title="Thumbs down"
                              >
                                <ThumbsDown size={12} />
                              </button>
                              <button
                                onClick={() =>
                                  handleCopyMessage(
                                    message.content,
                                    model.id,
                                    messageIndex
                                  )
                                }
                                className={`p-1.5 rounded-lg text-xs transition-all duration-200 hover:bg-white/50 ${copiedMessageId === `${model.id}-${messageIndex}`
                                  ? "bg-blue-100 text-blue-600"
                                  : "text-gray-500 hover:text-blue-600"
                                  }`}
                                title={
                                  copiedMessageId === `${model.id}-${messageIndex}`
                                    ? "Copied!"
                                    : "Copy"
                                }
                              >
                                <Copy size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="max-w-[85%] rounded-xl p-3 shadow-sm transition-transform bg-gradient-to-br from-gray-700 to-gray-800 text-white">
                          <div className="text-xs leading-relaxed whitespace-pre-wrap font-medium">
                            {message.content}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white/80 rounded-xl p-3 max-w-[85%] border border-white/60 shadow-sm">
                      <div className="flex items-center space-x-1">
                        <div
                          className="w-1.5 h-1.5 rounded-full animate-bounce"
                          style={{ backgroundColor: model.accentColor }}
                        ></div>
                        <div
                          className="w-1.5 h-1.5 rounded-full animate-bounce"
                          style={{ backgroundColor: model.accentColor, animationDelay: "0.1s" }}
                        ></div>
                        <div
                          className="w-1.5 h-1.5 rounded-full animate-bounce"
                          style={{ backgroundColor: model.accentColor, animationDelay: "0.2s" }}
                        ></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Input Area */}
      <div className="relative z-10 p-3">
        <div className="max-w-4xl mx-auto bg-white/20 backdrop-blur-xl rounded-2xl shadow-xl border border-white/30 p-4">
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask all AI models anything..."
                rows={1}
                className="w-full px-4 py-3 pr-12 border-0 rounded-xl bg-white/60 backdrop-blur-sm text-gray-800 placeholder-gray-500 focus:ring-2 focus:ring-blue-400/50 focus:outline-none resize-none shadow-md transition-all duration-300 font-medium text-sm"
                style={{ minHeight: "44px", maxHeight: "88px" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <button
                type="submit"
                disabled={!prompt.trim() || isLoading}
                className={`absolute right-2 top-1/2 transform -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 shadow-md ${prompt.trim() && !isLoading
                  ? "bg-gradient-to-br from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 hover:scale-105 shadow-blue-200"
                  : "bg-gray-300/60 text-gray-500 cursor-not-allowed"
                  }`}
              >
                {isLoading ? (
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Send size={14} />
                )}
              </button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="text-[10px] text-gray-600 font-medium">
                Press Enter to send, Shift+Enter for new line
              </div>
              <div className="text-[10px] text-gray-600 font-semibold">
                {prompt.length}/2000
              </div>
            </div>
          </form>
        </div>
      </div>

      <style jsx global>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .font-inter {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
      `}</style>
    </div>
  );
}

