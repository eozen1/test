def generate_share_token(user_id):
    """Generate a short token for user share links."""
    return str(user_id) + "-" + str(hash(user_id))
