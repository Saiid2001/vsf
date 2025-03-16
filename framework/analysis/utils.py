from pathlib import Path
from typing import List, Literal
import re


class PatternList:

    # regex rules
    rules: List[re.Pattern]

    def __init__(self, rules: List[re.Pattern]):
        self.rules = rules

    @staticmethod
    def from_file(fp: Path):

        rules = []

        with open(fp, "r") as f:
            for line in f:
                if line.startswith("!"):
                    continue

                if line.strip() == "":
                    continue

                rules.append(re.compile(line.strip()))

        return PatternList(rules)

    def matches(self, text: str, method: Literal["match", "search"] = "match") -> bool:
        
        if method not in ["match", "search"]:
            raise ValueError("method must be either 'match' or 'search'")

        for rule in self.rules:
            if method == "match":
                if rule.match(text):
                    return True
            elif method == "search":
                if rule.search(text):
                    return True

        return False

    def matching_rule(self, text: str, full: bool = False) -> str:

        for rule in self.rules:

            if full:
                if rule.fullmatch(text):
                    return rule.pattern
            else:
                if rule.search(text):
                    return rule.pattern

        return None


def normalize_dict(d: dict):

    # if the value is a list with only one element, convert it to a single value
    for key in d:
        if isinstance(d[key], list) and len(d[key]) == 1:
            d[key] = d[key][0]

        if isinstance(d[key], dict):
            d[key] = normalize_dict(d[key])

    return d

def normalize_variable_name(d: dict):

    # if the key is "root['...']" convert it to "..."
    pattern = re.compile(r"root\['[a-zA-Z0-9\_\-\.]+'\]")

    for key in list(d.keys()):
        if pattern.fullmatch(key):
            new_key = key.split("'")[1]
            d[new_key] = d[key]
            del d[key]

    # remove characters that cause problems for regex
    for key in list(d.keys()):
        new_key = re.sub(r"[^a-zA-Z0-9_]", "", key)

        if new_key != key:
            d[new_key] = d[key]
            del d[key]

    return d