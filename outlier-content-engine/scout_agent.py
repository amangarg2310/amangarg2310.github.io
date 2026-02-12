"""
Scout - Conversational AI agent for the Outlier Content Engine.

Scout helps users set up verticals, add brands, and run analyses through
natural conversation instead of traditional forms.
"""

import os
import json
import re
from typing import Dict, List, Optional, Tuple
from openai import OpenAI
import config
from vertical_manager import VerticalManager

class ScoutAgent:
    """Conversational AI agent for vertical management."""

    def __init__(self):
        """Initialize Scout with OpenAI client."""
        api_key = config.get_api_key('openai')
        if not api_key:
            raise ValueError("OpenAI API key not configured")

        self.client = OpenAI(api_key=api_key)
        self.model = "gpt-4o-mini"
        self.vm = VerticalManager()

    def get_system_prompt(self, context: Dict) -> str:
        """Generate system prompt based on current context."""
        base_prompt = """You are Scout, a helpful AI assistant for the Outlier Content Engine - a platform that finds viral social media content by detecting statistical outliers in engagement metrics.

Your personality:
- Friendly, energetic, and knowledgeable about social media trends
- Help users discover what content is breaking through the noise
- Use casual, conversational tone (avoid corporate jargon)
- Occasional relevant emoji (don't overdo it)
- ALWAYS guide users step-by-step - don't assume they know what to do next
- Be proactive: explain what you're doing and what comes next

Your capabilities:
1. Help users create categories to track (like "Streetwear" or "Sneaker Brands" or "Tech Gadgets")
2. Add Instagram and TikTok brand handles to track
3. Run analyses to find viral outlier content
4. Explain insights and next steps

Key concepts:
- Category = A group of related brands you want to track (e.g., "Streetwear", "Gaming Brands", "DTC Beauty")
- Brands = Instagram/TikTok accounts to monitor in that category
- Outliers = Posts with exceptional engagement (2x+ the norm)

IMPORTANT:
- Use "category" or "collection" instead of "vertical" when talking to users
- Use real brand examples (Nike, Supreme, PlayStation, Glossier, etc.)
- Always end your responses with a clear next step or question to guide the user forward

Current state:
"""

        # Add context about existing verticals
        verticals = self.vm.list_verticals()
        if verticals:
            base_prompt += f"- Existing verticals: {', '.join(verticals)}\n"
            if context.get('active_vertical'):
                vertical = self.vm.get_vertical(context['active_vertical'])
                if vertical:
                    base_prompt += f"- Active vertical: {vertical.name} ({len(vertical.brands)} brands)\n"
        else:
            base_prompt += "- No verticals created yet\n"

        # Add API key status
        rapidapi_key = config.get_api_key('rapidapi')
        openai_key = config.get_api_key('openai')
        base_prompt += f"- RapidAPI configured: {'Yes' if rapidapi_key else 'No'}\n"
        base_prompt += f"- OpenAI configured: {'Yes' if openai_key else 'No'}\n"

        base_prompt += """
Instructions:
- Be concise but helpful
- When user wants to create a vertical, ask for the name and brands
- Parse brand handles from natural language (e.g., "@nike on tiktok" = TikTok handle)
- Support formats: @handle, @ig_handle | @tt_handle, @handle | tiktok
- Confirm actions before executing
- Guide users on next steps
- If API keys are missing, help them set up first
- NEVER output JSON to the user - always use natural, friendly language
- Focus on conversational responses, not technical output
"""

        return base_prompt

    def parse_brands_from_text(self, text: str) -> List[Dict[str, Optional[str]]]:
        """
        Parse brand handles from natural language.

        Examples:
        - "@nike" -> [{"instagram": "nike", "tiktok": None}]
        - "@nike on tiktok" -> [{"instagram": None, "tiktok": "nike"}]
        - "@supreme @stussy" -> [{"instagram": "supreme"}, {"instagram": "stussy"}]
        - "@nike | @nikestyle" -> [{"instagram": "nike", "tiktok": "nikestyle"}]
        """
        brands = []

        # Pattern 1: @handle | @handle (both platforms)
        pipe_pattern = r'@(\w+)\s*\|\s*@(\w+)'
        for match in re.finditer(pipe_pattern, text):
            brands.append({
                "instagram": match.group(1),
                "tiktok": match.group(2)
            })

        # Pattern 2: @handle | tiktok (TikTok only)
        tiktok_only_pattern = r'@(\w+)\s*\|\s*tiktok'
        for match in re.finditer(tiktok_only_pattern, text):
            brands.append({
                "instagram": None,
                "tiktok": match.group(1)
            })

        # Pattern 3: @handle on/for tiktok
        natural_tiktok_pattern = r'@(\w+)\s+(?:on|for|via)\s+tiktok'
        for match in re.finditer(natural_tiktok_pattern, text, re.IGNORECASE):
            brands.append({
                "instagram": None,
                "tiktok": match.group(1)
            })

        # Pattern 4: @handle on/for instagram
        natural_instagram_pattern = r'@(\w+)\s+(?:on|for|via)\s+instagram'
        for match in re.finditer(natural_instagram_pattern, text, re.IGNORECASE):
            brands.append({
                "instagram": match.group(1),
                "tiktok": None
            })

        # Pattern 5: Simple @handle (assume Instagram)
        # Exclude already matched handles
        matched_handles = {b.get('instagram') or b.get('tiktok') for b in brands}
        simple_pattern = r'@(\w+)'
        for match in re.finditer(simple_pattern, text):
            handle = match.group(1)
            if handle not in matched_handles and handle.lower() not in ['tiktok', 'instagram', 'ig', 'tt']:
                brands.append({
                    "instagram": handle,
                    "tiktok": None
                })
                matched_handles.add(handle)

        return brands

    def detect_intent(self, message: str, context: Dict) -> Dict:
        """
        Detect user intent from message.

        Returns dict with 'intent' and extracted entities.
        """
        message_lower = message.lower()

        # Intent: Save API key
        if any(word in message_lower for word in ['api key', 'rapidapi', 'openai']):
            if message.startswith('sk-'):
                return {"intent": "save_api_key", "service": "openai", "key": message}
            elif len(message) > 30 and not message.startswith('sk-'):
                return {"intent": "save_api_key", "service": "rapidapi", "key": message}

        # Intent: Create vertical
        if any(phrase in message_lower for phrase in ['create vertical', 'new vertical', 'track', 'monitor', 'watch']):
            # Extract vertical name
            vertical_patterns = [
                r'create\s+(?:a\s+)?(?:vertical\s+)?(?:for\s+|called\s+)?["\']?(\w+(?:\s+\w+)?)["\']?',
                r'track\s+(\w+(?:\s+\w+)?)\s+brands',
                r'monitor\s+(\w+(?:\s+\w+)?)',
            ]
            for pattern in vertical_patterns:
                match = re.search(pattern, message_lower)
                if match:
                    return {"intent": "create_vertical", "name": match.group(1).title()}

        # Intent: Add brands
        if '@' in message or any(phrase in message_lower for phrase in ['add brand', 'add handle', 'track @']):
            brands = self.parse_brands_from_text(message)
            if brands:
                return {
                    "intent": "add_brands",
                    "brands": brands,
                    "vertical": context.get('active_vertical') or context.get('pending_vertical')
                }

        # Intent: Run analysis
        if any(phrase in message_lower for phrase in ['run analysis', 'analyze', 'find outliers', 'check content', 'scan']):
            return {
                "intent": "run_analysis",
                "vertical": context.get('active_vertical')
            }

        # Intent: List verticals
        if any(phrase in message_lower for phrase in ['list vertical', 'show vertical', 'what vertical', 'my vertical']):
            return {"intent": "list_verticals"}

        # Intent: Help
        if any(word in message_lower for word in ['help', 'what can you do', 'commands']):
            return {"intent": "help"}

        # Default: conversational
        return {"intent": "chat"}

    def execute_action(self, intent_data: Dict, context: Dict) -> Tuple[str, Dict]:
        """
        Execute detected intent and return response + updated context.

        Returns (response_text, updated_context)
        """
        intent = intent_data.get('intent')

        # Handle API key saving
        if intent == 'save_api_key':
            service = intent_data['service']
            key = intent_data['key']
            # Save to database
            import sqlite3
            from datetime import datetime, timezone

            conn = sqlite3.connect(str(config.DB_PATH))
            now = datetime.now(timezone.utc).isoformat()
            conn.execute("""
                INSERT OR REPLACE INTO api_credentials (service, api_key, updated_at)
                VALUES (?, ?, ?)
            """, (service, key, now))
            conn.commit()
            conn.close()

            if service == 'rapidapi':
                return ("Got your RapidAPI key! Now I need your OpenAI API key (starts with sk-) to power my AI analysis.", context)
            else:
                return ("Perfect! All set up. What vertical would you like to track first?", context)

        # Handle vertical creation
        if intent == 'create_vertical':
            name = intent_data['name']
            if self.vm.create_vertical(name):
                context['pending_vertical'] = name
                context['active_vertical'] = name
                return (f"Nice! I've set up **{name}** for you.\n\nNow let's add some brands to track. Just drop their Instagram or TikTok handles:\n• Simple: `@supreme @nike @stussy`\n• TikTok only: `@handle | tiktok`\n• Both platforms: `@supreme_insta | @supreme_tiktok`\n\nWhat brands should I start tracking?", context)
            else:
                return (f"Looks like you already have **{name}** set up! Want to:\n• Add more brands to it\n• Create a different category\n• See what you're already tracking\n\nWhat works for you?", context)

        # Handle adding brands
        if intent == 'add_brands':
            vertical_name = intent_data.get('vertical')
            brands = intent_data.get('brands', [])

            if not vertical_name:
                return ("Which vertical should I add these brands to? Or should I create a new one?", context)

            added = 0
            skipped = 0
            brand_list = []

            for brand in brands:
                ig = brand.get('instagram')
                tt = brand.get('tiktok')

                try:
                    if self.vm.add_brand(vertical_name, instagram_handle=ig, tiktok_handle=tt):
                        added += 1
                        platforms = []
                        if ig:
                            platforms.append(f"IG @{ig}")
                        if tt:
                            platforms.append(f"TT @{tt}")
                        brand_list.append(" + ".join(platforms))
                    else:
                        skipped += 1
                except Exception:
                    skipped += 1

            response = f"Added {added} brand{'s' if added != 1 else ''} to **{vertical_name}**!\n"
            for b in brand_list[:5]:  # Show first 5
                response += f"• {b}\n"
            if len(brand_list) > 5:
                response += f"• ...and {len(brand_list) - 5} more\n"

            if skipped > 0:
                response += f"\n({skipped} already in there)\n"

            response += "\n**Ready to find some viral posts?** Just say **'analyze'** and I'll scan these brands to find what's popping off right now!"

            return (response, context)

        # Handle run analysis
        if intent == 'run_analysis':
            vertical = intent_data.get('vertical')
            if not vertical:
                verticals = self.vm.list_verticals()
                if len(verticals) == 1:
                    vertical = verticals[0]
                else:
                    return ("Which category should I analyze?", context)

            # Trigger the actual analysis
            import subprocess
            import sys

            try:
                # Run the engine in the background for this vertical
                # Note: main.py expects --profile flag (YAML config system)
                # We pass the vertical name as profile name
                cmd = [sys.executable, "main.py", "--profile", vertical, "--no-email"]

                def _run_analysis():
                    try:
                        result = subprocess.run(
                            cmd,
                            cwd=str(config.PROJECT_ROOT),
                            capture_output=True,
                            text=True,
                            timeout=300
                        )

                        # Log the result for debugging
                        import logging
                        logger = logging.getLogger(__name__)

                        if result.returncode != 0:
                            logger.error(f"Analysis failed with code {result.returncode}")
                            logger.error(f"STDOUT: {result.stdout}")
                            logger.error(f"STDERR: {result.stderr}")

                            # Store error in context for user feedback
                            context['analysis_error'] = result.stderr or "Analysis process failed"
                        else:
                            logger.info(f"Analysis completed successfully for {vertical}")
                            logger.info(f"Output: {result.stdout}")
                            context['analysis_success'] = True

                    except subprocess.TimeoutExpired:
                        import logging
                        logging.error(f"Analysis timed out after 5 minutes")
                        context['analysis_error'] = "Analysis took too long and timed out"
                    except Exception as e:
                        import logging
                        logging.error(f"Analysis failed: {e}")
                        context['analysis_error'] = str(e)

                import threading
                thread = threading.Thread(target=_run_analysis, daemon=True)
                thread.start()

                # Mark that analysis has started
                context['analysis_started'] = True

                return (f"Let's go! Running analysis on **{vertical}** right now.\n\n**Here's what's happening:**\n• Pulling recent posts from all your brands\n• Crunching engagement numbers (likes, comments, shares, saves)\n• Finding the outliers (posts doing 2x+ better than usual)\n• Ranking the top performers\n\n**Takes about a minute.** Then check the **Outliers** page to see what's crushing it!", context)
            except Exception as e:
                return (f"Oops, couldn't start the analysis: {str(e)}\n\nTry running it from the Dashboard instead!", context)

        # Handle list verticals
        if intent == 'list_verticals':
            verticals = self.vm.list_verticals()
            if not verticals:
                return ("You haven't set up any categories yet!\n\n**Let's get started:**\nJust tell me what you want to track - like 'track streetwear brands' or 'track gaming brands' or 'track beauty brands'\n\nWhat sounds good?", context)

            response = "Here's what you're tracking:\n\n"
            for v_name in verticals:
                vertical = self.vm.get_vertical(v_name)
                if vertical:
                    response += f"• **{v_name}** - {len(vertical.brands)} brand{'s' if len(vertical.brands) != 1 else ''}\n"

            response += "\n**What next?**\n• Add more brands: 'add @supreme @nike to [category]'\n• Find viral posts: 'analyze [category]'\n• New category: 'track [new thing] brands'\n\nWhat do you want to do?"

            return (response, context)

        # Handle help
        if intent == 'help':
            return ("""Hey! I'm **Scout** - I help you find viral social media posts. 🔍

**What I do:** I track brands you care about and tell you which of their posts are absolutely crushing it (doing 2x+ better than their usual engagement).

**How it works:**

**1. Pick a category**
Tell me what you want to track - like "track streetwear brands" or "track gaming brands"

**2. Add brands**
Just drop some handles:
• Simple: `@supreme @nike @stussy`
• TikTok: `@handle on tiktok`
• Both: `@nike_ig | @nike_tt`

**3. Find what's viral**
Say "analyze" and I'll:
• Pull recent posts from your brands
• Crunch the engagement numbers
• Show you what's popping off

**4. Check the results**
Head to the Outliers page to see the winners!

**Try it:** "track streetwear brands" or "track sneaker brands"

What do you want to track first?""", context)

        # Default: Let OpenAI handle it
        return (None, context)

    def chat(self, message: str, context: Dict) -> Tuple[str, Dict]:
        """
        Process user message and return Scout's response.

        Args:
            message: User's message text
            context: Conversation context (active_vertical, chat_history, etc.)

        Returns:
            (response_text, updated_context)
        """
        # First, try rule-based intent detection
        intent_data = self.detect_intent(message, context)

        # Execute action if we have a clear intent
        if intent_data['intent'] != 'chat':
            response, new_context = self.execute_action(intent_data, context)
            if response:
                return (response, new_context)

        # Fall back to OpenAI for conversational responses
        messages = [
            {"role": "system", "content": self.get_system_prompt(context)}
        ]

        # Add chat history
        if 'chat_history' in context:
            messages.extend(context['chat_history'][-6:])  # Last 6 messages for context

        # Add current user message
        messages.append({"role": "user", "content": message})

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                max_tokens=500
            )

            assistant_message = response.choices[0].message.content

            # Filter out JSON responses - if OpenAI returns JSON, give a friendly fallback
            if assistant_message and (assistant_message.strip().startswith('{') or assistant_message.strip().startswith('["{')):
                assistant_message = "I'm not quite sure what you mean. Could you rephrase that? Try things like:\n• 'track [category] brands'\n• 'add @brand1 @brand2'\n• 'analyze'\n• 'help'"

            # Update chat history
            if 'chat_history' not in context:
                context['chat_history'] = []
            context['chat_history'].append({"role": "user", "content": message})
            context['chat_history'].append({"role": "assistant", "content": assistant_message})

            return (assistant_message, context)

        except Exception as e:
            return (f"Oops, something went wrong: {str(e)}", context)
