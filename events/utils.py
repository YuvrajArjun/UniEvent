import random
import time


def _random_hex(length=6):
    chars = "0123456789ABCDEF"
    return "".join(random.choice(chars) for _ in range(length))


def generate_token():
    return f"UNI-EVNT-{int(time.time() * 1000)}-{_random_hex(6)}"


def generate_transaction_hash():
    return f"TXN-{int(time.time() * 1000):X}-{_random_hex(8)}"
