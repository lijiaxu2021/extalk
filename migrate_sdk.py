#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ExTalk SDK 迁移脚本
将 SDK 代码从 index.ts 迁移到独立的 sdk.js 文件
"""

import re
from pathlib import Path

def extract_sdk_from_index():
    """从 index.ts 中提取 SDK 代码"""
    index_path = Path('src/index.ts')
    
    with open(index_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 查找 SDK 代码的开始和结束位置
    sdk_start_marker = "const sdkCode = `"
    sdk_end_marker = "`;\n      return new Response(sdkCode,"
    
    start_index = content.find(sdk_start_marker)
    end_index = content.find(sdk_end_marker)
    
    if start_index == -1 or end_index == -1:
        print("❌ 未找到 SDK 代码的边界")
        print(f"Start found: {start_index}, End found: {end_index}")
        return None
    
    # 移动到开始标记之后
    start_index = start_index + len(sdk_start_marker)
    
    # 提取 SDK 代码
    sdk_code = content[start_index:end_index]
    
    # 清理代码：移除多余的缩进
    lines = sdk_code.split('\n')
    cleaned_lines = []
    for line in lines:
        # 移除每行开头的 8 个空格（缩进）
        if line.startswith('        '):
            cleaned_lines.append(line[8:])
        else:
            cleaned_lines.append(line)
    
    sdk_code = '\n'.join(cleaned_lines)
    
    return sdk_code

def save_sdk_to_file(sdk_code):
    """保存 SDK 代码到 sdk.js 文件"""
    sdk_path = Path('src/sdk.js')
    
    with open(sdk_path, 'w', encoding='utf-8') as f:
        f.write(sdk_code)
    
    print(f"✅ SDK 代码已保存到 {sdk_path}")

def update_index_ts():
    """更新 index.ts，移除 SDK 代码，添加路由"""
    index_path = Path('src/index.ts')
    
    with open(index_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 找到 SDK 代码的位置
    sdk_start_marker = "const sdkCode = `"
    sdk_end_marker = "`;\n      return new Response(sdkCode,"
    
    sdk_start = content.find(sdk_start_marker)
    sdk_end = content.find(sdk_end_marker)
    
    if sdk_start == -1 or sdk_end == -1:
        print("❌ 未找到 SDK 代码")
        return False
    
    # 找到 SDK 路由的开始位置（if 语句）
    route_start_marker = 'if (url.pathname === "/sdk.js") {'
    route_start = content.find(route_start_marker)
    
    if route_start == -1:
        print("❌ 未找到 SDK 路由")
        return False
    
    # SDK 路由结束位置（SDK 代码结束后）
    sdk_route_end = sdk_end + len(sdk_end_marker)
    
    # 找到整个 SDK 路由块的结束（下一个 if 或 else 之前）
    # 简单处理：找到下一个 "if (url.pathname" 或者函数结束
    next_route = content.find("if (url.pathname === '", sdk_route_end)
    if next_route == -1:
        next_route = content.find("}", sdk_route_end)
    
    if next_route != -1:
        sdk_route_end = next_route
    
    # 替换为简单的文件读取返回
    new_sdk_route = '''if (url.pathname === '/sdk.js') {
      try {
        const sdkPath = new URL('./sdk.js', import.meta.url);
        const sdkCode = await fetch(sdkPath).then(r => r.text());
        return new Response(sdkCode, {
          headers: { ...corsHeaders, "Content-Type": "application/javascript; charset=utf-8" },
        });
      } catch (err) {
        console.error('SDK 加载失败:', err);
        return new Response('SDK not found', { status: 404 });
      }
    }

    '''
    
    # 替换 SDK 路由代码
    content = content[:route_start] + new_sdk_route + content[sdk_route_end:]
    
    with open(index_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"✅ index.ts 已更新")
    return True

def main():
    print("🚀 开始迁移 ExTalk SDK...")
    print()
    
    # 1. 从 index.ts 提取 SDK 代码
    print("📝 正在从 index.ts 提取 SDK 代码...")
    sdk_code = extract_sdk_from_index()
    
    if not sdk_code:
        print("❌ 提取 SDK 代码失败")
        return
    
    # 2. 保存到 sdk.js 文件
    print("💾 正在保存 SDK 代码到 sdk.js...")
    save_sdk_to_file(sdk_code)
    
    # 3. 更新 index.ts
    print("🔄 正在更新 index.ts...")
    if not update_index_ts():
        print("❌ 更新 index.ts 失败")
        return
    
    print()
    print("✅ SDK 迁移完成！")
    print()
    print("📊 变更统计:")
    print("   - 从 index.ts 移除了 SDK 代码")
    print("   - 创建了独立的 src/sdk.js 文件")
    print("   - 更新了 SDK 路由处理逻辑")
    print()
    print("🎯 下一步:")
    print("   1. 运行 'npx wrangler deploy' 部署到 Cloudflare")
    print("   2. 测试 SDK 加载是否正常")

if __name__ == '__main__':
    main()
