"""
Reporter — generates and sends the daily HTML email report.

Builds a clean, readable email with inline CSS (email-client safe).
All brand references come from the active profile.
Falls back to saving HTML locally if email is not configured.
"""

import logging
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Dict, Optional

import config
from profile_loader import BrandProfile
from outlier_detector import OutlierPost, CompetitorBaseline

logger = logging.getLogger(__name__)


# ── Color Palette (brand-neutral) ──
COLORS = {
    "bg": "#f4f4f7",
    "card": "#ffffff",
    "primary": "#1a1a2e",
    "accent": "#e94560",
    "text": "#2d2d2d",
    "muted": "#6b7280",
    "border": "#e5e7eb",
    "success": "#10b981",
    "warning": "#f59e0b",
    "light_bg": "#f9fafb",
}


class ReportGenerator:
    """Generates HTML email reports from analysis results."""

    def __init__(self, profile: BrandProfile):
        self.profile = profile

    def generate_report(self, analysis: Dict,
                        outliers: List[OutlierPost],
                        baselines: Dict[str, CompetitorBaseline],
                        run_stats: Dict) -> str:
        """
        Build the full HTML email report.

        Args:
            analysis: LLM analysis results dict.
            outliers: Outlier posts (sorted by score).
            baselines: Per-competitor baselines.
            run_stats: Collection run statistics.

        Returns:
            Complete HTML string ready to send.
        """
        sections = []
        sections.append(self._section_header())
        sections.append(self._section_summary(outliers, baselines, run_stats))

        if outliers:
            sections.append(self._section_top_outliers(outliers[:5], baselines))

        patterns = analysis.get("weekly_patterns", {})
        if patterns and any(patterns.values()):
            sections.append(self._section_patterns(patterns))

        adaptations = analysis.get("brand_adaptations", [])
        if adaptations:
            sections.append(self._section_adaptations(adaptations))

        calendar = analysis.get("content_calendar_suggestions", [])
        if calendar:
            sections.append(self._section_calendar(calendar))

        if baselines:
            sections.append(self._section_competitor_breakdown(baselines))

        budget_notice = analysis.get("budget_notice")
        if budget_notice:
            sections.append(self._section_budget_notice(budget_notice))

        sections.append(self._section_footer(run_stats))

        body = "\n".join(sections)
        return self._wrap_html(body)

    def send_email(self, html: str,
                   recipients: Optional[List[str]] = None) -> bool:
        """
        Send the report via Gmail SMTP.

        Returns True if sent successfully, False otherwise.
        """
        recipients = recipients or config.EMAIL_RECIPIENTS
        if not recipients:
            logger.warning("No email recipients configured.")
            return False

        if not config.EMAIL_ADDRESS or not config.EMAIL_PASSWORD:
            logger.warning(
                "Email credentials not configured. "
                "Set EMAIL_ADDRESS and EMAIL_APP_PASSWORD in .env"
            )
            return False

        today = datetime.now().strftime("%Y-%m-%d")
        subject = f"{self.profile.name} Content Intel \u2014 {today}"

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = config.EMAIL_ADDRESS
        msg["To"] = ", ".join(recipients)

        # Plain text fallback
        plain = (
            f"{self.profile.name} Competitor Outlier Report - {today}\n\n"
            "View this email in an HTML-capable client for the full report."
        )
        msg.attach(MIMEText(plain, "plain"))
        msg.attach(MIMEText(html, "html"))

        try:
            with smtplib.SMTP(config.SMTP_SERVER, config.SMTP_PORT) as server:
                server.starttls()
                server.login(config.EMAIL_ADDRESS, config.EMAIL_PASSWORD)
                server.send_message(msg)
            logger.info(f"Report emailed to {', '.join(recipients)}")
            return True
        except smtplib.SMTPAuthenticationError:
            logger.error(
                "Email auth failed. Make sure you're using a Gmail App Password, "
                "not your regular password. Generate one at: "
                "https://myaccount.google.com/apppasswords"
            )
            return False
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False

    def save_local(self, html: str) -> str:
        """Save report as local HTML file. Returns the file path."""
        today = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"report_{self.profile.profile_name}_{today}.html"
        filepath = config.DATA_DIR / filename
        filepath.write_text(html, encoding="utf-8")
        logger.info(f"Report saved to {filepath}")
        return str(filepath)

    # ── Section Builders ──

    def _section_header(self) -> str:
        today = datetime.now().strftime("%B %d, %Y")
        return f"""
        <div style="background:{COLORS['primary']}; padding:32px 24px; text-align:center;">
            <h1 style="color:#ffffff; margin:0; font-size:24px; font-weight:600;">
                {self.profile.name} Content Intelligence
            </h1>
            <p style="color:#a0aec0; margin:8px 0 0; font-size:14px;">
                Competitor Outlier Report &mdash; {today}
            </p>
        </div>"""

    def _section_summary(self, outliers: List[OutlierPost],
                         baselines: Dict[str, CompetitorBaseline],
                         run_stats: Dict) -> str:
        total_posts = run_stats.get("posts_collected", 0)
        new_posts = run_stats.get("posts_new", 0)
        num_outliers = len(outliers)
        competitors_count = len(baselines)
        errors = run_stats.get("errors", [])

        # Find top competitor (most outliers)
        comp_outlier_counts: Dict[str, int] = {}
        for o in outliers:
            comp_outlier_counts[o.competitor_name] = (
                comp_outlier_counts.get(o.competitor_name, 0) + 1
            )
        top_comp = max(comp_outlier_counts, key=comp_outlier_counts.get) if comp_outlier_counts else "N/A"

        error_html = ""
        if errors:
            error_html = f"""
            <div style="background:#fef2f2; border-left:3px solid {COLORS['accent']};
                        padding:8px 12px; margin-top:12px; font-size:13px; color:#991b1b;">
                {len(errors)} collection error(s) occurred. Check logs for details.
            </div>"""

        return f"""
        <div style="padding:24px;">
            <h2 style="color:{COLORS['primary']}; font-size:16px; margin:0 0 16px;
                       text-transform:uppercase; letter-spacing:1px;">
                Overview
            </h2>
            <table style="width:100%; border-collapse:collapse;">
                <tr>
                    <td style="padding:12px; text-align:center; border:1px solid {COLORS['border']};">
                        <div style="font-size:28px; font-weight:700; color:{COLORS['primary']};">
                            {total_posts}
                        </div>
                        <div style="font-size:12px; color:{COLORS['muted']}; margin-top:4px;">
                            Posts Scanned
                        </div>
                    </td>
                    <td style="padding:12px; text-align:center; border:1px solid {COLORS['border']};">
                        <div style="font-size:28px; font-weight:700; color:{COLORS['accent']};">
                            {num_outliers}
                        </div>
                        <div style="font-size:12px; color:{COLORS['muted']}; margin-top:4px;">
                            Outliers Found
                        </div>
                    </td>
                    <td style="padding:12px; text-align:center; border:1px solid {COLORS['border']};">
                        <div style="font-size:28px; font-weight:700; color:{COLORS['primary']};">
                            {competitors_count}
                        </div>
                        <div style="font-size:12px; color:{COLORS['muted']}; margin-top:4px;">
                            Competitors
                        </div>
                    </td>
                </tr>
            </table>
            <p style="font-size:13px; color:{COLORS['muted']}; margin-top:12px;">
                {new_posts} new posts collected this run.
                Top outlier source: <strong>{top_comp}</strong>
            </p>
            {error_html}
        </div>"""

    def _section_top_outliers(self, outliers: List[OutlierPost],
                              baselines: Dict[str, CompetitorBaseline]) -> str:
        cards = []
        for i, o in enumerate(outliers, 1):
            baseline = baselines.get(o.competitor_handle)
            avg_eng = round(baseline.mean_engagement) if baseline else "N/A"
            caption_preview = (o.caption or "No caption")[:200]
            if o.caption and len(o.caption) > 200:
                caption_preview += "..."

            views_display = f"{o.views:,}" if o.views else "N/A"
            avg_display = f"{avg_eng:,}" if isinstance(avg_eng, (int, float)) else avg_eng

            tags_html = ""
            if o.content_tags:
                tag_badges = "".join(
                    f'<span style="display:inline-block; background:{COLORS["light_bg"]}; '
                    f'color:{COLORS["muted"]}; font-size:11px; padding:2px 8px; '
                    f'border-radius:12px; margin:2px 4px 2px 0;">{t}</span>'
                    for t in o.content_tags[:5]
                )
                tags_html = f'<div style="margin-top:8px;">{tag_badges}</div>'

            cards.append(f"""
            <div style="border:1px solid {COLORS['border']}; border-radius:8px;
                        padding:16px; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <span style="background:{COLORS['accent']}; color:#fff; font-size:12px;
                                     padding:2px 8px; border-radius:4px; font-weight:600;">
                            #{i}
                        </span>
                        <strong style="margin-left:8px; color:{COLORS['primary']};">
                            {o.competitor_name}
                        </strong>
                        <span style="color:{COLORS['muted']}; font-size:13px;">
                            @{o.competitor_handle}
                        </span>
                    </div>
                    <span style="background:{COLORS['primary']}; color:#fff; font-size:12px;
                                 padding:2px 10px; border-radius:4px;">
                        {o.engagement_multiplier}x avg
                    </span>
                </div>
                <p style="font-size:13px; color:{COLORS['text']}; margin:12px 0 8px;
                          line-height:1.5; font-style:italic;">
                    &ldquo;{caption_preview}&rdquo;
                </p>
                <table style="width:100%; font-size:12px; color:{COLORS['muted']};">
                    <tr>
                        <td>Likes: <strong style="color:{COLORS['text']};">{o.likes:,}</strong></td>
                        <td>Comments: <strong style="color:{COLORS['text']};">{o.comments:,}</strong></td>
                        <td>Views: <strong style="color:{COLORS['text']};">{views_display}</strong></td>
                        <td>Type: <strong style="color:{COLORS['text']};">{o.media_type}</strong></td>
                    </tr>
                    <tr>
                        <td colspan="2">Total Engagement: <strong style="color:{COLORS['text']};">{o.total_engagement:,}</strong></td>
                        <td colspan="2">Account Avg: <strong style="color:{COLORS['text']};">{avg_display}</strong></td>
                    </tr>
                </table>
                {tags_html}
            </div>""")

        return f"""
        <div style="padding:0 24px 24px;">
            <h2 style="color:{COLORS['primary']}; font-size:16px; margin:0 0 16px;
                       text-transform:uppercase; letter-spacing:1px;">
                Top Outliers
            </h2>
            {"".join(cards)}
        </div>"""

    def _section_patterns(self, patterns: Dict) -> str:
        def _list_items(items: list) -> str:
            if not items:
                return '<li style="color:#6b7280;">No data yet</li>'
            return "".join(
                f'<li style="padding:4px 0;">{item}</li>' for item in items
            )

        return f"""
        <div style="padding:0 24px 24px;">
            <h2 style="color:{COLORS['primary']}; font-size:16px; margin:0 0 16px;
                       text-transform:uppercase; letter-spacing:1px;">
                Patterns Detected
            </h2>
            <div style="background:{COLORS['light_bg']}; border-radius:8px; padding:16px;">
                <table style="width:100%; font-size:13px; color:{COLORS['text']};">
                    <tr>
                        <td style="vertical-align:top; padding:8px; width:50%;">
                            <strong style="color:{COLORS['success']};">Best Content Types</strong>
                            <ul style="margin:8px 0; padding-left:20px;">
                                {_list_items(patterns.get('best_content_types', []))}
                            </ul>
                        </td>
                        <td style="vertical-align:top; padding:8px; width:50%;">
                            <strong style="color:{COLORS['success']};">Best Posting Days</strong>
                            <ul style="margin:8px 0; padding-left:20px;">
                                {_list_items(patterns.get('best_posting_days', []))}
                            </ul>
                        </td>
                    </tr>
                    <tr>
                        <td style="vertical-align:top; padding:8px;">
                            <strong style="color:{COLORS['warning']};">Trending Themes</strong>
                            <ul style="margin:8px 0; padding-left:20px;">
                                {_list_items(patterns.get('trending_themes', []))}
                            </ul>
                        </td>
                        <td style="vertical-align:top; padding:8px;">
                            <strong style="color:{COLORS['accent']};">Avoid</strong>
                            <ul style="margin:8px 0; padding-left:20px;">
                                {_list_items(patterns.get('avoid', []))}
                            </ul>
                        </td>
                    </tr>
                </table>
            </div>
        </div>"""

    def _section_adaptations(self, adaptations: List[Dict]) -> str:
        cards = []
        for i, a in enumerate(adaptations, 1):
            fit_score = a.get("brand_fit_score", "?")
            fit_color = COLORS["success"] if isinstance(fit_score, int) and fit_score >= 7 else COLORS["warning"]

            cards.append(f"""
            <div style="border:1px solid {COLORS['border']}; border-radius:8px;
                        padding:16px; margin-bottom:12px;">
                <div style="margin-bottom:8px;">
                    <span style="background:{COLORS['primary']}; color:#fff; font-size:11px;
                                 padding:2px 8px; border-radius:4px;">
                        Idea #{i}
                    </span>
                    <span style="float:right; color:{fit_color}; font-size:13px; font-weight:600;">
                        Brand Fit: {fit_score}/10
                    </span>
                </div>
                <p style="font-size:14px; color:{COLORS['text']}; margin:8px 0;
                          line-height:1.6; font-weight:500;">
                    &ldquo;{a.get('adapted_caption', 'N/A')}&rdquo;
                </p>
                <table style="width:100%; font-size:12px; color:{COLORS['muted']}; margin-top:8px;">
                    <tr>
                        <td style="padding:4px 0;">
                            <strong>Format:</strong> {a.get('format_suggestion', 'N/A')}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:4px 0;">
                            <strong>Visual:</strong> {a.get('visual_direction', 'N/A')}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:4px 0;">
                            <strong>Best time:</strong> {a.get('best_posting_time', 'N/A')}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:4px 0;">
                            <strong>Keep:</strong> {a.get('what_to_keep', 'N/A')}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:4px 0;">
                            <strong>Change:</strong> {a.get('what_to_change', 'N/A')}
                        </td>
                    </tr>
                </table>
                <p style="font-size:11px; color:{COLORS['muted']}; margin:8px 0 0;">
                    Inspired by: @{a.get('original_competitor', 'N/A')}
                </p>
            </div>""")

        return f"""
        <div style="padding:0 24px 24px;">
            <h2 style="color:{COLORS['primary']}; font-size:16px; margin:0 0 16px;
                       text-transform:uppercase; letter-spacing:1px;">
                {self.profile.name}-Adapted Content Ideas
            </h2>
            {"".join(cards)}
        </div>"""

    def _section_calendar(self, calendar: List[Dict]) -> str:
        rows = []
        for entry in calendar[:7]:
            rows.append(f"""
            <tr>
                <td style="padding:10px 12px; border-bottom:1px solid {COLORS['border']};
                           font-weight:600; color:{COLORS['primary']}; width:100px;">
                    {entry.get('day', '')}
                </td>
                <td style="padding:10px 12px; border-bottom:1px solid {COLORS['border']};">
                    <div style="font-size:13px; color:{COLORS['text']}; font-weight:500;">
                        {entry.get('concept', '')}
                    </div>
                    <div style="font-size:12px; color:{COLORS['muted']}; margin-top:4px;">
                        {entry.get('content_type', '')} &bull;
                        &ldquo;{(entry.get('caption_draft', '') or '')[:100]}...&rdquo;
                    </div>
                </td>
            </tr>""")

        return f"""
        <div style="padding:0 24px 24px;">
            <h2 style="color:{COLORS['primary']}; font-size:16px; margin:0 0 16px;
                       text-transform:uppercase; letter-spacing:1px;">
                Suggested Content Calendar
            </h2>
            <table style="width:100%; border-collapse:collapse; font-size:13px;">
                {"".join(rows)}
            </table>
        </div>"""

    def _section_competitor_breakdown(self,
                                     baselines: Dict[str, CompetitorBaseline]) -> str:
        rows = []
        for handle, bl in sorted(baselines.items(),
                                 key=lambda x: x[1].mean_engagement,
                                 reverse=True):
            rows.append(f"""
            <tr>
                <td style="padding:10px 12px; border-bottom:1px solid {COLORS['border']};
                           font-weight:500;">
                    {bl.name}
                    <div style="font-size:11px; color:{COLORS['muted']};">@{handle}</div>
                </td>
                <td style="padding:10px 12px; border-bottom:1px solid {COLORS['border']};
                           text-align:center;">
                    {bl.post_count}
                </td>
                <td style="padding:10px 12px; border-bottom:1px solid {COLORS['border']};
                           text-align:center;">
                    {round(bl.mean_likes):,}
                </td>
                <td style="padding:10px 12px; border-bottom:1px solid {COLORS['border']};
                           text-align:center;">
                    {round(bl.mean_comments):,}
                </td>
                <td style="padding:10px 12px; border-bottom:1px solid {COLORS['border']};
                           text-align:center; font-weight:600; color:{COLORS['primary']};">
                    {round(bl.mean_engagement):,}
                </td>
            </tr>""")

        return f"""
        <div style="padding:0 24px 24px;">
            <h2 style="color:{COLORS['primary']}; font-size:16px; margin:0 0 16px;
                       text-transform:uppercase; letter-spacing:1px;">
                Competitor Breakdown
            </h2>
            <table style="width:100%; border-collapse:collapse; font-size:13px;
                          color:{COLORS['text']};">
                <tr style="background:{COLORS['light_bg']};">
                    <th style="padding:10px 12px; text-align:left; font-size:12px;
                               color:{COLORS['muted']}; text-transform:uppercase;">
                        Competitor
                    </th>
                    <th style="padding:10px 12px; text-align:center; font-size:12px;
                               color:{COLORS['muted']}; text-transform:uppercase;">
                        Posts
                    </th>
                    <th style="padding:10px 12px; text-align:center; font-size:12px;
                               color:{COLORS['muted']}; text-transform:uppercase;">
                        Avg Likes
                    </th>
                    <th style="padding:10px 12px; text-align:center; font-size:12px;
                               color:{COLORS['muted']}; text-transform:uppercase;">
                        Avg Comments
                    </th>
                    <th style="padding:10px 12px; text-align:center; font-size:12px;
                               color:{COLORS['muted']}; text-transform:uppercase;">
                        Avg Engagement
                    </th>
                </tr>
                {"".join(rows)}
            </table>
        </div>"""

    def _section_budget_notice(self, notice: str) -> str:
        return f"""
        <div style="padding:0 24px 24px;">
            <div style="background:#fef3cd; border:1px solid #ffc107;
                        border-radius:8px; padding:12px 16px;">
                <strong style="color:#856404;">Budget Notice:</strong>
                <span style="color:#856404; font-size:13px;"> {notice}</span>
            </div>
        </div>"""

    def _section_footer(self, run_stats: Dict) -> str:
        duration = run_stats.get("duration_seconds", 0)
        return f"""
        <div style="background:{COLORS['light_bg']}; padding:16px 24px;
                    border-top:1px solid {COLORS['border']};">
            <p style="font-size:11px; color:{COLORS['muted']}; margin:0; text-align:center;">
                Generated by Outlier Content Engine &bull;
                Profile: {self.profile.profile_name} &bull;
                Runtime: {duration:.1f}s &bull;
                {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}
            </p>
        </div>"""

    def _wrap_html(self, body: str) -> str:
        """Wrap content in a full HTML document with inline CSS reset."""
        return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{self.profile.name} Content Intelligence Report</title>
</head>
<body style="margin:0; padding:20px; background:{COLORS['bg']};
             font-family:Arial, Helvetica, sans-serif; -webkit-font-smoothing:antialiased;">
    <div style="max-width:640px; margin:0 auto; background:{COLORS['card']};
                border-radius:8px; overflow:hidden;
                box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        {body}
    </div>
</body>
</html>"""
