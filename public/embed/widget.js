(function() {
  'use strict';
  
  // Prevent multiple initializations
  if (window.PluggedinChatWidget) {
    console.warn('Pluggedin Chat Widget already loaded');
    return;
  }

  // Widget namespace
  window.PluggedinChatWidget = {
    version: '1.0.0',
    initialized: false,
    instances: new Map(),
    config: {},
  };

  // Main Widget Class
  class PluggedinChat {
    constructor(config = {}) {
      this.config = {
        chatUuid: config.chatUuid || window.PluggedinChat?.chatId,
        apiKey: config.apiKey || window.PluggedinChat?.apiKey,
        apiBase: config.apiBase || window.PluggedinChat?.apiBase || 'https://plugged.in',
        position: config.position || 'bottom-right',
        theme: {
          primaryColor: '#3b82f6',
          borderRadius: '12px',
          fontFamily: 'system-ui, sans-serif',
          ...config.theme
        },
        features: {
          fileUpload: true,
          markdown: true,
          exportChat: true,
          ...config.features
        },
        appearance: {
          width: '380px',
          height: '600px',
          closedHeight: '60px',
          zIndex: 999999,
          ...config.appearance
        },
        behavior: {
          autoOpen: false,
          showWelcome: true,
          persistence: true,
          ...config.behavior
        },
        ...config
      };

      this.isOpen = false;
      this.iframe = null;
      this.container = null;
      this.button = null;
      this.unreadCount = 0;
      this.initialized = false;
      this.chatConfig = null;

      this.init();
    }

    async init() {
      if (this.initialized) return;
      
      try {
        // Load chat configuration first
        await this.loadChatConfig();
        
        this.createContainer();
        this.createButton();
        this.createIframe();
        this.setupEventListeners();
        this.loadStyles();
        
        this.initialized = true;
        console.log('Pluggedin Chat Widget initialized');
        
        // Store instance
        window.PluggedinChatWidget.instances.set(this.config.chatUuid, this);
        
        // Auto-open if configured
        if (this.config.behavior.autoOpen) {
          setTimeout(() => this.open(), 1000);
        }
      } catch (error) {
        console.error('Failed to initialize Pluggedin Chat Widget:', error);
      }
    }

    async loadChatConfig() {
      try {
        const response = await fetch(`${this.config.apiBase}/api/public/chat/${this.config.chatUuid}/config`, {
          headers: {
            ...(this.config.apiKey && { 'X-API-Key': this.config.apiKey })
          }
        });
        
        if (response.ok) {
          this.chatConfig = await response.json();
          
          // Apply chat configuration to widget config
          if (this.chatConfig.theme) {
            this.config.theme = { ...this.config.theme, ...this.chatConfig.theme };
          }
          
          if (this.chatConfig.dimensions) {
            this.config.appearance = {
              ...this.config.appearance,
              width: `${this.chatConfig.dimensions.width}px`,
              height: `${this.chatConfig.dimensions.height}px`,
              closedHeight: `${this.chatConfig.dimensions.minimizedSize}px`
            };
          }
          
          if (this.chatConfig.behavior) {
            this.config.behavior = { ...this.config.behavior, ...this.chatConfig.behavior };
          }
          
          if (this.chatConfig.position) {
            this.config.position = this.chatConfig.position;
          }
          
          console.log('Chat configuration loaded:', this.chatConfig);
        } else {
          console.warn('Failed to load chat configuration, using defaults');
        }
      } catch (error) {
        console.warn('Failed to load chat configuration:', error);
      }
    }

    createContainer() {
      this.container = document.createElement('div');
      this.container.id = `pluggedin-chat-${this.config.chatUuid}`;
      this.container.className = 'pluggedin-chat-widget';
      
      // Position styles
      const positions = {
        'bottom-right': { bottom: '20px', right: '20px' },
        'bottom-left': { bottom: '20px', left: '20px' },
        'bottom-center': { bottom: '20px', left: '50%', transform: 'translateX(-50%)' },
      };
      
      const pos = positions[this.config.position] || positions['bottom-right'];
      
      Object.assign(this.container.style, {
        position: 'fixed',
        zIndex: this.config.appearance.zIndex,
        fontFamily: this.config.theme.fontFamily,
        ...pos
      });
      
      document.body.appendChild(this.container);
    }

    createButton() {
      this.button = document.createElement('div');
      this.button.className = 'pluggedin-chat-button';
      this.button.innerHTML = `
        <div class="chat-button-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H5.17L4 17.17V4H20V16Z" fill="currentColor"/>
            <circle cx="12" cy="10" r="2" fill="currentColor"/>
            <circle cx="8" cy="10" r="1" fill="currentColor"/>
            <circle cx="16" cy="10" r="1" fill="currentColor"/>
          </svg>
        </div>
        <div class="chat-button-close" style="display: none;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="unread-badge" style="display: none;">0</div>
      `;
      
      Object.assign(this.button.style, {
        width: this.config.appearance.closedHeight,
        height: this.config.appearance.closedHeight,
        backgroundColor: this.config.theme.primaryColor,
        borderRadius: '50%',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        transition: 'all 0.3s ease',
        position: 'relative'
      });

      this.button.addEventListener('click', () => this.toggle());
      this.button.addEventListener('mouseenter', () => {
        this.button.style.transform = 'scale(1.1)';
      });
      this.button.addEventListener('mouseleave', () => {
        this.button.style.transform = 'scale(1)';
      });

      this.container.appendChild(this.button);
    }

    createIframe() {
      this.iframe = document.createElement('iframe');
      this.iframe.className = 'pluggedin-chat-iframe';
      
      // Build iframe URL with config including welcome message and suggested questions
      const params = new URLSearchParams({
        chatUuid: this.config.chatUuid,
        embedded: 'true',
        ...(this.config.apiKey && { apiKey: this.config.apiKey }),
        theme: JSON.stringify(this.config.theme),
        features: JSON.stringify(this.config.features)
      });
      
      // Add chat configuration data if available
      if (this.chatConfig) {
        if (this.chatConfig.welcome_message) {
          params.set('welcomeMessage', this.chatConfig.welcome_message);
        }
        if (this.chatConfig.suggested_questions && this.chatConfig.suggested_questions.length > 0) {
          params.set('suggestedQuestions', JSON.stringify(this.chatConfig.suggested_questions));
        }
        if (this.chatConfig.branding) {
          params.set('branding', JSON.stringify(this.chatConfig.branding));
        }
      }
      
      this.iframe.src = `${this.config.apiBase}/embed/chat?${params.toString()}`;
      this.iframe.allow = 'clipboard-write';
      this.iframe.loading = 'lazy';
      
      // Dynamic positioning based on widget position
      let iframePositioning = {};
      
      if (this.config.position.includes('left')) {
        iframePositioning = {
          bottom: `calc(${this.config.appearance.closedHeight} + 10px)`,
          left: '0',
          right: 'auto'
        };
      } else if (this.config.position.includes('center')) {
        iframePositioning = {
          bottom: `calc(${this.config.appearance.closedHeight} + 10px)`,
          left: '50%',
          right: 'auto',
          transform: 'translateX(-50%)'
        };
      } else {
        // Default to right
        iframePositioning = {
          bottom: `calc(${this.config.appearance.closedHeight} + 10px)`,
          right: '0',
          left: 'auto'
        };
      }

      Object.assign(this.iframe.style, {
        width: this.config.appearance.width,
        height: this.config.appearance.height,
        border: 'none',
        borderRadius: this.config.theme.borderRadius,
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        backgroundColor: 'white',
        display: 'none',
        position: 'absolute',
        transition: 'all 0.3s ease',
        ...iframePositioning
      });

      this.container.appendChild(this.iframe);
    }

    setupEventListeners() {
      // Listen for messages from iframe
      window.addEventListener('message', (event) => {
        if (event.origin !== new URL(this.config.apiBase).origin) return;
        if (event.source !== this.iframe.contentWindow) return;

        const { type, data } = event.data;
        
        switch (type) {
          case 'chat-ready':
            this.onChatReady();
            break;
          case 'new-message':
            this.onNewMessage(data);
            break;
          case 'unread-count':
            this.updateUnreadCount(data.count);
            break;
          case 'resize':
            this.onResize(data);
            break;
          case 'close':
            this.close();
            break;
        }
      });

      // Handle escape key
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.isOpen) {
          this.close();
        }
      });

      // Handle click outside
      document.addEventListener('click', (event) => {
        if (this.isOpen && !this.container.contains(event.target)) {
          // Don't close if clicking on elements that might be related to chat
          if (!event.target.closest('.pluggedin-chat-widget')) {
            this.close();
          }
        }
      });
    }

    loadStyles() {
      if (document.getElementById('pluggedin-chat-styles')) return;
      
      const styles = document.createElement('style');
      styles.id = 'pluggedin-chat-styles';
      styles.textContent = `
        .pluggedin-chat-widget {
          --primary-color: ${this.config.theme.primaryColor};
          font-family: ${this.config.theme.fontFamily};
        }
        
        .pluggedin-chat-button:hover {
          filter: brightness(1.1);
        }
        
        .unread-badge {
          position: absolute;
          top: -5px;
          right: -5px;
          background: #ef4444;
          color: white;
          border-radius: 10px;
          min-width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
        }
        
        .pluggedin-chat-iframe.opening {
          animation: chatSlideIn 0.3s ease;
        }
        
        .pluggedin-chat-iframe.closing {
          animation: chatSlideOut 0.3s ease;
        }
        
        @keyframes chatSlideIn {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        @keyframes chatSlideOut {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
        }
        
        @media (max-width: 768px) {
          .pluggedin-chat-iframe {
            width: calc(100vw - 20px) !important;
            height: calc(100vh - 80px) !important;
            left: 10px !important;
            right: auto !important;
            bottom: 70px !important;
            transform: none !important;
          }
        }
      `;
      
      document.head.appendChild(styles);
    }

    open() {
      if (this.isOpen) return;
      
      this.isOpen = true;
      this.iframe.style.display = 'block';
      this.iframe.classList.add('opening');
      
      // Update button appearance
      this.button.querySelector('.chat-button-icon').style.display = 'none';
      this.button.querySelector('.chat-button-close').style.display = 'flex';
      
      // Reset unread count
      this.updateUnreadCount(0);
      
      // Send open event to iframe
      setTimeout(() => {
        this.iframe.classList.remove('opening');
        this.postMessageToChat('widget-opened');
      }, 300);
    }

    close() {
      if (!this.isOpen) return;
      
      this.isOpen = false;
      this.iframe.classList.add('closing');
      
      setTimeout(() => {
        this.iframe.style.display = 'none';
        this.iframe.classList.remove('closing');
        
        // Update button appearance
        this.button.querySelector('.chat-button-icon').style.display = 'flex';
        this.button.querySelector('.chat-button-close').style.display = 'none';
        
        this.postMessageToChat('widget-closed');
      }, 300);
    }

    toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    }

    updateUnreadCount(count) {
      this.unreadCount = count;
      const badge = this.button.querySelector('.unread-badge');
      
      if (count > 0 && !this.isOpen) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }

    onChatReady() {
      console.log('Chat iframe ready');
      // Send initial config
      this.postMessageToChat('widget-config', this.config);
    }

    onNewMessage(data) {
      if (!this.isOpen) {
        this.updateUnreadCount(this.unreadCount + 1);
        
        // Show notification if supported
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('New message', {
            body: data.preview || 'You have a new message',
            icon: '/favicon.ico'
          });
        }
      }
    }

    onResize(data) {
      if (data.height) {
        this.iframe.style.height = `${Math.min(data.height, 600)}px`;
      }
    }

    postMessageToChat(type, data = {}) {
      if (this.iframe && this.iframe.contentWindow) {
        this.iframe.contentWindow.postMessage({
          type,
          data,
          source: 'widget'
        }, this.config.apiBase);
      }
    }

    // Public API methods
    sendMessage(message) {
      this.postMessageToChat('send-message', { message });
      if (!this.isOpen) this.open();
    }

    setConfig(newConfig) {
      this.config = { ...this.config, ...newConfig };
      this.postMessageToChat('update-config', this.config);
    }

    destroy() {
      if (this.container) {
        this.container.remove();
      }
      window.PluggedinChatWidget.instances.delete(this.config.chatUuid);
    }
  }

  // Global initialization function
  window.PluggedinChat = window.PluggedinChat || {};
  window.PluggedinChat.initialize = function(customConfig = {}) {
    if (window.PluggedinChatWidget.initialized) {
      console.warn('Pluggedin Chat Widget already initialized');
      return;
    }

    const config = {
      ...window.PluggedinChat,
      ...customConfig
    };

    if (!config.chatId && !config.chatUuid) {
      console.error('Pluggedin Chat: No chat ID provided');
      return;
    }

    config.chatUuid = config.chatUuid || config.chatId;
    
    const widget = new PluggedinChat(config);
    window.PluggedinChatWidget.initialized = true;
    window.PluggedinChatWidget.instance = widget;
    
    return widget;
  };

  // Auto-initialize if config is available
  if (window.PluggedinChat && (window.PluggedinChat.chatId || window.PluggedinChat.chatUuid)) {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        window.PluggedinChat.initialize();
      });
    } else {
      window.PluggedinChat.initialize();
    }
  }

  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

})();