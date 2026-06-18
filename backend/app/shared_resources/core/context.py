import contextvars

current_user_var = contextvars.ContextVar("current_user", default="System")
