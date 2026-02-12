"""
Archived routes from the old YAML-profile-based dashboard.

These were replaced by the Signal AI interface (/signal).
Kept here for reference. The templates these routes reference are in archived/templates/.

To restore: copy relevant routes back into dashboard.py and move templates back to templates/.
"""


# ── Old Page Routes (replaced by /signal) ──

# @app.route("/competitors")
# def competitors_page():
#     """Competitor management page."""
#     profile = get_profile()
#     return render_template("competitors.html",
#                            active_page="competitors",
#                            profile=profile)


# @app.route("/voice")
# def voice_page():
#     """Brand voice editor page."""
#     profile = get_profile()
#     voice_analysis, own_top_posts = get_voice_analysis()
#     return render_template("voice.html",
#                            active_page="voice",
#                            profile=profile,
#                            voice_analysis=voice_analysis,
#                            own_top_posts=own_top_posts)


# @app.route("/outliers")
# def outliers_page():
#     """Outlier posts viewer."""
#     profile = get_profile()
#     vertical_name = get_active_vertical_name()
#     competitor = request.args.get("competitor", "")
#     platform = request.args.get("platform", "")
#     sort_by = request.args.get("sort", "score")
#     timeframe = request.args.get("timeframe", "")
#
#     outliers = get_outlier_posts(competitor=competitor or None,
#                                  platform=platform or None,
#                                  sort_by=sort_by,
#                                  vertical_name=vertical_name,
#                                  timeframe=timeframe or None)
#
#     return render_template("outliers.html",
#                            active_page="outliers",
#                            profile=profile,
#                            outliers=outliers,
#                            selected_competitor=competitor,
#                            selected_platform=platform,
#                            selected_timeframe=timeframe,
#                            sort_by=sort_by)


# @app.route("/reports")
# def reports_page():
#     """Reports viewer page."""
#     viewing = request.args.get("view")
#     return render_template("reports.html",
#                            active_page="reports",
#                            reports=get_report_files(),
#                            viewing_report=viewing)


# @app.route("/settings")
# def settings_page():
#     """Settings page — thresholds, content tags."""
#     profile = get_profile()
#     return render_template("settings.html",
#                            active_page="settings",
#                            profile=profile,
#                            settings=profile.outlier_settings,
#                            content_tags=profile.content_tags,
#                            posts_per_competitor=config.DEFAULT_POSTS_PER_COMPETITOR)


# ── Old Action Routes (YAML profile-based) ──

# @app.route("/switch-profile", methods=["POST"])
# def switch_profile():
#     """Switch the active brand profile."""
#     ...

# @app.route("/competitors/add", methods=["POST"])
# def add_competitor():
#     """Add a new competitor to the active profile."""
#     ...

# @app.route("/competitors/remove", methods=["POST"])
# def remove_competitor():
#     """Remove a competitor from the active profile."""
#     ...

# @app.route("/voice/save", methods=["POST"])
# def save_voice():
#     """Save brand voice settings."""
#     ...

# @app.route("/settings/save", methods=["POST"])
# def save_settings():
#     """Save outlier detection and content tag settings."""
#     ...
