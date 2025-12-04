import indexHtml from '../index.html';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    try {
      // Serve HTML page
      if (path === '/' || path === '/index.html') {
        return new Response(indexHtml, {
          headers: {
            'Content-Type': 'text/html;charset=UTF-8',
          },
        });
      }

      // API: Get all messages
      if (path === '/api/messages' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT id, content, email, created_at FROM messages ORDER BY created_at DESC LIMIT 100'
        ).all();

        return new Response(JSON.stringify({ messages: results }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      }

      // API: Create new message
      if (path === '/api/messages' && request.method === 'POST') {
        const data = await request.json();
        const { content, email } = data;

        // Validation
        if (!content || !email) {
          return new Response(
            JSON.stringify({ error: '留言内容和邮箱不能为空' }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        // Email validation
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        // const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return new Response(
            JSON.stringify({ error: '邮箱格式不正确' }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        // Content length validation
        if (content.length > 1000) {
          return new Response(
            JSON.stringify({ error: '留言内容不能超过1000个字符' }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        }

        // Insert message with FIFO strategy
        // 优化点：使用 batch 同时执行插入和清理，限制最大留言数为 1000 条
        const MAX_MESSAGES_LIMIT = 10;
        
        const results = await env.DB.batch([
          // 1. 插入新留言
          env.DB.prepare(
            'INSERT INTO messages (content, email, created_at) VALUES (?, ?, datetime("now"))'
          ).bind(content, email),
          
          // 2. 滚动删除：只保留最新的 N 条，删除其余的
          env.DB.prepare(
            `DELETE FROM messages 
             WHERE id NOT IN (
               SELECT id FROM messages ORDER BY created_at DESC LIMIT ?
             )`
          ).bind(MAX_MESSAGES_LIMIT)
        ]);

        // results[0] 是第一条插入语句的执行结果
        const insertResult = results[0];

        if (insertResult.success) {
          return new Response(
            JSON.stringify({
              success: true,
              message: '留言发送成功',
            }),
            {
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
              },
            }
          );
        } else {
          throw new Error('保存留言失败');
        }
      }

      // 404 Not Found
      return new Response('Not Found', {
        status: 404,
        headers: corsHeaders,
      });
    } catch (error) {
      console.error('Error:', error);
      return new Response(
        JSON.stringify({ error: '服务器错误: ' + error.message }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
  },
};
