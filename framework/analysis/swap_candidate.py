from abc import abstractmethod
import binascii
from collections import defaultdict
from dataclasses import dataclass
from enum import Enum
import hashlib
import json
from typing import Dict, List, Optional, Union
import re
from urllib.parse import parse_qs, unquote, urlencode, quote
import base64

from db import UserdiffRequest
from reqresp import headers_to_dict, split_url_into_path_and_query
from utils import normalize_dict


id_type = str


class MultipleValuesForVariableError(ValueError):
    pass


def check_for_multiple_values(dict1: Dict[str, str], dict2: Dict[str, str]):
    common_keys = set(dict1.keys()).intersection(dict2.keys())

    for key in common_keys:
        if dict1[key] != dict2[key]:
            raise MultipleValuesForVariableError(f"Multiple values for variable {key}")


def _variable_value(variables: Dict[str, dict], name: str, location_tags: List[str]):
    if name not in variables:
        return None
    val = None

    for tag in location_tags:
        if tag in variables[name]:
            val = variables[name][tag]
            break

    if val is None:
        val = variables[name]["default"]

    return val

def _escape_keys(d: dict):
    return {re.escape(k): v for k, v in d.items()}


class BodyEncoding(Enum):

    JSON = "json"
    FORM = "form"
    URL_ENCODED_FORM = "url_encoded_form"
    URL_ENCODED_JSON = "url_encoded_json"
    BASE64_JSON = "base64_json"
    UNKOWN = "unkown"
    NONE = "none"


@dataclass
class BodyInstance:
    value: Union[str, dict]
    encoding: BodyEncoding

    def is_dict(self):
        return self.encoding not in [BodyEncoding.NONE, BodyEncoding.UNKOWN]

    def to_dict(self):
        return {"value": self.value, "encoding": self.encoding.value}

    @classmethod
    def parse(cls, body: str, content_type: str = None):

        if not body:
            return cls("", BodyEncoding.NONE)

        # check if body is a valid json
        try:
            return cls(json.loads(body), BodyEncoding.JSON)
        except json.JSONDecodeError:
            pass

        if not content_type or not "json" in content_type:
            # check if body is a valid form data
            try:
                return cls(normalize_dict(parse_qs(body)), BodyEncoding.FORM)
            except:
                pass

            # URL encoded body
            try:
                return cls(
                    normalize_dict(parse_qs(unquote(body))),
                    BodyEncoding.URL_ENCODED_FORM,
                )
            except:
                pass

        try:
            return cls(json.loads(unquote(body)), BodyEncoding.URL_ENCODED_JSON)
        except json.JSONDecodeError:
            pass

        # check if base64 encoded
        try:
            return cls(
                json.loads(base64.b64decode(body).decode()), BodyEncoding.BASE64_JSON
            )
        except json.JSONDecodeError:
            pass
        except binascii.Error:
            pass
        except UnicodeDecodeError:
            pass

        # check if body is a valid xml
        # TODO: implement xml parsing

        return cls(body, BodyEncoding.UNKOWN)

    def compile(self):
        if self.encoding == BodyEncoding.JSON:
            return json.dumps(self.value)

        if self.encoding == BodyEncoding.FORM:
            return urlencode(self.value)

        if self.encoding == BodyEncoding.URL_ENCODED_FORM:
            quote(urlencode(self.value))

        if self.encoding == BodyEncoding.URL_ENCODED_JSON:
            return quote(json.dumps(self.value))

        if self.encoding == BodyEncoding.BASE64_JSON:
            return base64.b64encode(json.dumps(self.value).encode()).decode()

        if self.encoding == BodyEncoding.UNKOWN:
            return self.value

        return None


@dataclass
class RequestInstance:
    instance_id: id_type
    method: str
    url_path: str
    headers: Dict[str, str]
    query: Dict[str, str]
    body: BodyInstance

    @staticmethod
    def from_request(request: UserdiffRequest, instance_id: id_type):
        spath, query = split_url_into_path_and_query(request.url)
        headers = headers_to_dict(request.headers)
        body = request.body

        return RequestInstance(
            instance_id=instance_id,
            method=request.method,
            url_path=spath,
            headers=headers,
            query=query,
            body=BodyInstance.parse(body, headers.get("content-type")),
        )

    def to_dict(self):
        return {
            "instance_id": self.instance_id,
            "method": self.method,
            "url_path": self.url_path,
            "headers": self.headers,
            "query": self.query,
            "body": self.body,
        }


@dataclass
class SwapVariable:
    values: Dict[id_type, str]

    def register(self, instance_id: id_type, value: str):
        self.values[instance_id] = value

    def to_dict(self):
        return {"values": self.values}

    @staticmethod
    def from_dict(data: dict):
        return SwapVariable(data["values"])


class Template:

    type: str
    variable_names: List[str]
    locked: bool

    _SUBCLASS_MAP = {}

    def __init__(self, variable_names: List[str], locked: bool = False):
        self.variable_names = variable_names
        self.locked = locked

    @abstractmethod
    def extract_variable_values(self, instance_value):
        raise NotImplementedError()

    @abstractmethod
    def evaluate(self, variables: Dict[str, dict], location_tags: List[str] = []):
        raise NotImplementedError()

    @property
    def is_constant(self):
        return len(self.variable_names) == 0

    @abstractmethod
    def to_dict(self):
        raise NotImplementedError()

    @staticmethod
    @abstractmethod
    def from_dict(data: dict):

        if "type" not in data:
            raise ValueError("Invalid template: 'type' attribute not found")

        if data["type"] not in Template._SUBCLASS_MAP:
            raise ValueError(f"Invalid template: unknown type '{data['type']}'")

        return Template._SUBCLASS_MAP[data["type"]].from_dict(data)

    def __init_subclass__(cls) -> None:

        super().__init_subclass__()

        if not hasattr(cls, "type"):
            raise NotImplementedError("Subclasses must have a 'type' attribute")

        Template._SUBCLASS_MAP[cls.type] = cls


@dataclass
class StringTemplate(Template):
    template: str
    variable_names: List[str]
    locked: bool
    type = "StringTemplate"

    # we want to match complete values
    # for example searching for 123:
    # /123/ should match
    # /1234/ should not match
    # a:123 should match
    # a:1234 should not match
    # a: 123 should match
    # a: 1234 should not match

    COMPLETE_VALUE_REGEX = r"((^|[/: .\"\'\&,=]){value}([/: .\"\'\\\&,]|$))"

    @staticmethod
    def build(valuated_str: str, variables: Dict[str, str], locked: bool = False):

        # look for variable values in the string
        # the template is the string with the variable values replaced by the regex group to be used in the regex match

        if not valuated_str:
            return StringTemplate("", [], locked)

        if isinstance(valuated_str, float):
            return StringTemplate(str(valuated_str), [], locked)
        template = valuated_str
        template = re.escape(template)

        variable_names = []
        
        
        # match the longest possible match first
        # this helps cases for value overlap that is not intended
        variable_names_sorted = sorted((variables.keys()), key=lambda x: len(str(variables[x])), reverse=True)
        
        for variable_name in variable_names_sorted:
            
            value = variables[variable_name]
            
            value = re.escape(str(value))

            matches = re.findall(
                StringTemplate.COMPLETE_VALUE_REGEX.format(value=re.escape(value)),
                template,
            )
            if len(matches) > 0:
                variable_names.append(variable_name)

                for i in range(len(matches)):

                    # make value safe for regex
                    template = template.replace(
                        value, f"(?P<{variable_name}__{i}>[^/]+)", 1
                    )

        # update the variables dict

        return StringTemplate(template, variable_names, locked)

    def extract_variable_values(self, instance_value):

        if self.is_constant:
            return {}

        # if we are matching the full string just return it here
        # this helps some edge cases where the value contains unexpected characters
        if (
            len(self.variable_names) == 1
            and self.template.startswith("(")
            and self.template.endswith(")")
        ):
            return {self.variable_names[0]: instance_value}

        match = re.match(self.template, instance_value)
        if match:
            return {name: match[name + "__0"] for name in self.variable_names}
        return {}

    def evaluate(self, variables: Dict[str, dict], location_tags: List[str] = []):
        val = self.template

        for name in self.variable_names:

            val = val.replace(
                f"(?P<{name}>[^/]+)", _variable_value(variables, name, location_tags)
            )

            i = 0
            while f"(?P<{name}__{i}>[^/]+)" in val:
                val = val.replace(
                    f"(?P<{name}__{i}>[^/]+)",
                    _variable_value(variables, name, location_tags),
                )
                i += 1

        # decode escaped characters
        val = re.sub(r"\\(.)", r"\1", val)

        return val

    def to_dict(self):
        return {
            "type": "StringTemplate",
            "template": self.template,
            "variable_names": self.variable_names,
            "locked": self.locked,
        }

    @staticmethod
    def from_dict(data: dict):
        return StringTemplate(data["template"], data["variable_names"], data["locked"])


class IntegerTemplate(StringTemplate):

    type = "IntegerTemplate"

    @staticmethod
    def build(valuated_int: int, variables: Dict[str, str], locked: bool = False):
        template = StringTemplate.build(str(valuated_int), variables, locked)

        return IntegerTemplate(template.template, template.variable_names, locked)

    def extract_variable_values(self, instance_value: int):
        variable_values = super().extract_variable_values(str(instance_value))

        for key in variable_values:

            # deal with booleans
            if variable_values[key] == "True":
                variable_values[key] = True
            elif variable_values[key] == "False":
                variable_values[key] = False

            variable_values[key] = int(variable_values[key])

        return variable_values

    def evaluate(self, variables: Dict[str, dict], location_tags: List[str] = []):
        return int(super().evaluate(variables, location_tags))

    def to_dict(self):
        return {
            "type": "IntegerTemplate",
            "template": self.template,
            "variable_names": self.variable_names,
            "locked": self.locked,
        }

    @staticmethod
    def from_dict(data: dict):
        return IntegerTemplate(data["template"], data["variable_names"], data["locked"])


@dataclass
class KeyValTemplate:
    key: StringTemplate
    value: Template

    def to_dict(self):
        return {
            "type": "KeyValTemplate",
            "key": self.key.to_dict(),
            "value": self.value.to_dict(),
        }

    @staticmethod
    def from_dict(data: dict):
        return KeyValTemplate(
            StringTemplate.from_dict(data["key"]),
            Template.from_dict(data["value"]),
        )


@dataclass
class DictTemplate(Template):
    entries: List[KeyValTemplate]
    type: str = "DictTemplate"

    @staticmethod
    def build(valuated_dict: Dict[str, str], variables: Dict[str, str]):

        entries = []

        for key, value in valuated_dict.items():

            key_template = StringTemplate.build(key, variables)

            if isinstance(value, list):
                value_template = ListTemplate.build(value, variables)
            elif isinstance(value, dict):
                value_template = DictTemplate.build(value, variables)
            elif isinstance(value, int):
                value_template = IntegerTemplate.build(value, variables)
            else:
                value_template = StringTemplate.build(value, variables)

            entries.append(KeyValTemplate(key_template, value_template))

        return DictTemplate(entries)

    def extract_variable_values(self, instance_value: Dict[str, str]):

        variable_values = {}

        # keys are escaped in the template, so we need to do the same for the instance dict
        normalized_instance_value = _escape_keys(instance_value)
        
        for entry in self.entries:

            # TODO: for now we are assuming that the key is always constant, later we should allow for variable keys
            if not entry.key.is_constant:
                raise NotImplementedError()

            if entry.key.template not in normalized_instance_value:
                continue
            
            val = normalized_instance_value[entry.key.template]

            
            entry_variable_values = entry.value.extract_variable_values(val)

            check_for_multiple_values(variable_values, entry_variable_values)

            variable_values = {**variable_values, **entry_variable_values}

        return variable_values

    def evaluate(self, variables: Dict[str, str], location_tags: List[str] = []):
        # TODO: for now we are assuming that the key is always constant, later we should allow for variable keys
        return {
            entry.key.template: entry.value.evaluate(variables, location_tags)
            for entry in self.entries
        }

    @property
    def variable_names(self):
        return list(
            set(
                [
                    name
                    for entry in self.entries
                    for name in entry.key.variable_names + entry.value.variable_names
                ]
            )
        )

    @property
    def is_constant(self):
        return len(self.variable_names) == 0

    def to_dict(self):
        return {
            "type": "DictTemplate",
            "entries": [entry.to_dict() for entry in self.entries],
        }

    @staticmethod
    def from_dict(data: dict):
        return DictTemplate(
            [KeyValTemplate.from_dict(entry) for entry in data["entries"]]
        )


@dataclass
class ListTemplate(DictTemplate):

    type: str = "ListTemplate"
    

    @staticmethod
    def build(valuated_list: List[str], variables: Dict[str, str]):

        template = DictTemplate.build(
            {"list_item_" + str(i): val for i, val in enumerate(valuated_list)},
            variables,
        )

        return ListTemplate(template.entries)

    def extract_variable_values(self, instance_value: List[str]):

        variable_values = {}

        for entry in self.entries:

            key = entry.key.template
            i = int(key.split("_")[-1])

            if i >= len(instance_value):
                continue

            val = instance_value[i]

            entry_variable_values = entry.value.extract_variable_values(val)

            check_for_multiple_values(variable_values, entry_variable_values)

            variable_values = {**variable_values, **entry_variable_values}

        return variable_values

    def evaluate(self, variables: Dict[str, str], location_tags: List[str] = []):
        return [
            entry.value.evaluate(variables, location_tags) for entry in self.entries
        ]

    @property
    def variable_names(self):
        return list(
            set([name for entry in self.entries for name in entry.value.variable_names])
        )

    @property
    def is_constant(self):
        return len(self.variable_names) == 0

    def to_dict(self):
        return {
            "type": "ListTemplate",
            "entries": [entry.value.to_dict() for entry in self.entries],
        }

    @staticmethod
    def from_dict(data: dict):
        return ListTemplate(
            [
                KeyValTemplate(
                    StringTemplate("list_item_" + str(i), [], False),
                    Template.from_dict(entry),
                )
                for i, entry in enumerate(data["entries"])
            ]
        )


@dataclass
class BodyTemplate(Template):
    encoding: BodyEncoding
    template: Template
    type = "BodyTemplate"

    def is_dict(self):
        return self.encoding not in [BodyEncoding.NONE, BodyEncoding.UNKOWN]

    @staticmethod
    def build(valuated_body: BodyInstance, variables: Dict[str, str]):

        if valuated_body.is_dict():

            if isinstance(valuated_body.value, dict):
                return BodyTemplate(
                    valuated_body.encoding,
                    DictTemplate.build(valuated_body.value, variables),
                )
            elif isinstance(valuated_body.value, list):
                return BodyTemplate(
                    valuated_body.encoding,
                    ListTemplate.build(valuated_body.value, variables),
                )
            else:
                raise ValueError("Invalid body value")

        return BodyTemplate(
            valuated_body.encoding, StringTemplate.build(valuated_body.value, variables)
        )

    def extract_variable_values(self, instance_value: BodyInstance):

        if self.encoding != instance_value.encoding:
            raise ValueError(
                f"Invalid encoding: expected {self.encoding}, got {instance_value.encoding}"
            )

        return self.template.extract_variable_values(instance_value.value)

    def evaluate(self, variables: Dict[str, dict], location_tags: List[str] = []):

        body = BodyInstance(
            self.template.evaluate(variables, location_tags), self.encoding
        )

        return body.compile()

    @property
    def variable_names(self):
        return self.template.variable_names

    @property
    def is_constant(self):
        return self.template.is_constant

    def to_dict(self):
        return {
            "type": "BodyTemplate",
            "encoding": self.encoding.value,
            "template": self.template.to_dict(),
        }

    @staticmethod
    def from_dict(data: dict):

        # backwards compatibility
        if data["type"] == "StringTemplate":
            encoding = BodyEncoding.UNKOWN
            template = data
        elif data["type"] == "BodyTemplate":
            encoding = BodyEncoding(data["encoding"])
            template = data["template"]
        else:
            raise ValueError("Invalid body template: expected type='BodyTemplate'")

        if template["type"] == "StringTemplate":
            template = StringTemplate.from_dict(template)
        elif template["type"] == "DictTemplate":
            template = DictTemplate.from_dict(template)
        elif template["type"] == "ListTemplate":
            template = ListTemplate.from_dict(template)

        return BodyTemplate(encoding, template)


@dataclass
class SwapRequestTemplate:

    method: str
    url_path: StringTemplate
    headers: DictTemplate
    query: DictTemplate
    body: BodyTemplate
    variable_names: List[str]

    @staticmethod
    def build(instance: RequestInstance, variables: Dict[str, str]):

        variable_names = list(variables.keys())

        method = instance.method
        url_path = StringTemplate.build(instance.url_path, variables)
        headers = DictTemplate.build(instance.headers, variables)
        query = DictTemplate.build(instance.query, variables)

        body = BodyTemplate.build(instance.body, variables)

        return SwapRequestTemplate(
            method, url_path, headers, query, body, variable_names
        )

    def extract_variable_values(self, instance: RequestInstance):

        variable_values = {}

        url_path_values = self.url_path.extract_variable_values(instance.url_path)
        headers_values = self.headers.extract_variable_values(instance.headers)
        query_values = self.query.extract_variable_values(instance.query)
        body_values = self.body.extract_variable_values(instance.body)

        values_list = [url_path_values, headers_values, query_values, body_values]

        for values in values_list:
            check_for_multiple_values(variable_values, values)
            variable_values = {**variable_values, **values}

        return variable_values

    def evaluate(self, variables: Dict[str, dict]):
        return RequestInstance(
            instance_id="",
            method=self.method,
            url_path=self.url_path.evaluate(variables, ["url_path", "url"]),
            headers=self.headers.evaluate(variables, ["header"]),
            query=self.query.evaluate(variables, ["query", "url"]),
            body=self.body.evaluate(variables, ["body"]),
        )

    def to_dict(self):
        return {
            "method": self.method,
            "url_path": self.url_path.to_dict(),
            "headers": self.headers.to_dict(),
            "query": self.query.to_dict(),
            "body": self.body.to_dict(),
            "variable_names": self.variable_names,
        }

    def hash(self):
        return hashlib.sha1(
            json.dumps(self.to_dict(), sort_keys=True).encode()
        ).hexdigest()

    @staticmethod
    def from_dict(data: dict):

        method = data["method"]
        url_path = StringTemplate.from_dict(data["url_path"])
        headers = DictTemplate.from_dict(data["headers"])
        query = DictTemplate.from_dict(data["query"])
        body = BodyTemplate.from_dict(data["body"])
        variable_names = data["variable_names"]

        return SwapRequestTemplate(
            method, url_path, headers, query, body, variable_names
        )

    def preview(self, only_var=True):

        output = ""

        if only_var:
            output += "Only showing fields that have variables\n"

        if not only_var:
            output = f"Method: {self.method}\n"

        if not only_var or not self.url_path.is_constant:
            output += f"URL Path: {self.url_path.template}\n"

        for entry in self.headers.entries:
            if not only_var or not entry.key.is_constant or not entry.value.is_constant:
                output += f"Header: {entry.key.template}: {entry.value.template}\n"

        for entry in self.query.entries:
            if not only_var or not entry.key.is_constant or not entry.value.is_constant:
                output += f"Query: {entry.key.template}: {entry.value.template}\n"

        if not only_var or not self.body.is_constant:
            output += f"Body: {self.body.template}\n"

        return output


@dataclass
class SwapRequest:
    template: SwapRequestTemplate
    variables: Dict[str, SwapVariable]
    instances: List[id_type]

    @staticmethod
    def build(
        instance: RequestInstance,
        variables: Dict[str, str],
    ):

        template = SwapRequestTemplate.build(instance, variables)
        _variables = {
            name: SwapVariable({instance.instance_id: variables[name]})
            for name in template.variable_names
        }

        return SwapRequest(template, _variables, [instance.instance_id])

    def register_instance(self, instance: RequestInstance):

        variable_values = self.extract_values(instance)

        for variable_name, value in variable_values.items():
            self.variables[variable_name].register(instance.instance_id, value)

        self.instances.append(instance.instance_id)

        return self

    def extract_values(self, instance: RequestInstance):

        variable_values = self.template.extract_variable_values(instance)

        return variable_values

    def evaluate(
        self,
        instance_id: id_type,
        instance_ref_id: Optional[id_type] = None,
        variables: Optional[dict] = None,
    ):

        variable_names = (
            list(variables.keys()) if variables else list(self.variables.keys())
        )

        if not instance_ref_id and set(variable_names) != set(
            self.template.variable_names
        ):
            raise ValueError(
                "All variables must be provided or instance_ref_id must be provided"
            )

        variables_to_swap = (
            variables
            if variables
            else {var: {} for var in self.template.variable_names}
        )

        variable_values = defaultdict(dict)

        for name in variables_to_swap:

            swap_where = variables_to_swap[name].get("where", ["default"])

            for loc in swap_where:
                variable_values[name][loc] = self.variables[name].values[instance_id]

            if "default" not in variable_values[name]:
                variable_values[name]["default"] = self.variables[name].values[
                    instance_ref_id if instance_ref_id else instance_id
                ]

        if instance_ref_id:

            for variable_name in self.template.variable_names:
                if variable_name not in variables_to_swap:
                    variable_values[variable_name]["default"] = self.variables[
                        variable_name
                    ].values[instance_ref_id]

        return self.template.evaluate(variables=variable_values)

    def to_dict(self):
        return {
            "template": self.template.to_dict(),
            "variables": {
                name: variable.to_dict() for name, variable in self.variables.items()
            },
            "instances": self.instances,
        }

    def hash(self):

        return self.template.hash()

    @staticmethod
    def from_dict(data: dict):

        template = SwapRequestTemplate.from_dict(data["template"])
        variables = {
            name: SwapVariable.from_dict(data["variables"][name])
            for name in data["variables"]
        }
        instances = [str(x) for x in data["instances"]]

        return SwapRequest(template, variables, instances)

    def preview(self, only_var=True):

        output = f"Instances: {self.instances}\n"
        output += f"Variables: {self.variables}\n"
        output += f"Template:\n{self.template.preview(only_var)}\n"

        return output


# if __name__ == "__main__":

# TODO: write proper test cases

# instanceA = RequestInstance(
#     instance_id="A",
#     method="GET",
#     url_path="https://example.com/users/u293840/transactions",
#     headers={"Content-Type": "application/json", "Authorization": "Bearer 1234"},
#     query={"rnd": "1934", "page": "1"},
#     body=BodyInstance.parse('{"user_id": "u293840"}'),
# )

# instanceB = RequestInstance(
#     instance_id="B",
#     method="GET",
#     url_path="https://example.com/users/u239489/transactions",
#     headers={
#         "Content-Type": "application/json",
#         "Authorization": "Bearer 2492",
#         "X-Request-ID": "1234",
#     },
#     query={"rnd": "1234", "page": "2"},
#     body=BodyInstance.parse('{"user_id": "u239489"}'),
# )

# swap_request = SwapRequest.build(
#     instance=instanceA,
#     variables={"user_id": "u293840", "page_index": "1", "auth_token": "1234"},
# )

# swap_request.register_instance(instanceB)

# print("JSON:")
# print(
#     json.dumps(
#         swap_request.evaluate(
#             "B", instance_ref_id="A", variables={"user_id": {"where": ["body"]}}
#         ).to_dict(),
#         indent=2,
#     )
# )

# instanceA = RequestInstance(
#     instance_id="A",
#     method="GET",
#     url_path="https://example.com/users/u293840/transactions",
#     headers={"Content-Type": "application/json", "Authorization": "Bearer 1234"},
#     query={"rnd": "1934", "page": "1"},
#     body=BodyInstance.parse('user_id=u293840&_=ee0934'),
# )

# instanceB = RequestInstance(
#     instance_id="B",
#     method="GET",
#     url_path="https://example.com/users/u239489/transactions",
#     headers={
#         "Content-Type": "application/json",
#         "Authorization": "Bearer 2492",
#         "X-Request-ID": "1234",
#     },
#     query={"rnd": "1234", "page": "2"},
#     body=BodyInstance.parse('user_id=u239489&_=ee0934'),
# )

# swap_request = SwapRequest.build(
#     instance=instanceA,
#     variables={"user_id": "u293840", "page_index": "1", "auth_token": "1234"},
# )

# swap_request.register_instance(instanceB)

# print("FORM:")
# print(
#     json.dumps(
#         swap_request.evaluate(
#             "B", instance_ref_id="A", variables={"user_id": {"where": ["body"]}}
#         ).to_dict(),
#         indent=2,
#     )
# )


# instanceA = RequestInstance(
#     instance_id="A",
#     method="GET",
#     url_path="https://example.com/users/u293840/transactions",
#     headers={"Content-Type": "application/json", "Authorization": "Bearer 1234"},
#     query={"rnd": "1934", "page": "1"},
#     body=BodyInstance.parse(base64.b64encode('{"user_id": "u293840"}'.encode()).decode()),
# )

# instanceB = RequestInstance(
#     instance_id="B",
#     method="GET",
#     url_path="https://example.com/users/u239489/transactions",
#     headers={
#         "Content-Type": "application/json",
#         "Authorization": "Bearer 2492",
#         "X-Request-ID": "1234",
#     },
#     query={"rnd": "1234", "page": "2"},
#     body=BodyInstance.parse(base64.b64encode('{"user_id": "u239489"}'.encode()).decode()),
# )

# swap_request = SwapRequest.build(
#     instance=instanceA,
#     variables={"user_id": "u293840", "page_index": "1", "auth_token": "1234"},
# )

# swap_request.register_instance(instanceB)

# print("BASE64:")
# print(
#     json.dumps(
#         swap_request.evaluate(
#             "B", instance_ref_id="A", variables={"user_id": {"where": ["body"]}}
#         ).to_dict(),
#         indent=2,
#     )
# )

# print(json.dumps(swap_request.to_dict(), indent=2))

# strInstance1 = "ids%5B%5D=24698087&ids%5B%5D=24699444&ids%5B%5D=24698168"
# strInstance2 = "ids%5B%5D=24697087&ids%5B%5D=24695444&ids%5B%5D=24098168"

# strTemplate = StringTemplate.build(
#     strInstance1, {"id1": "24698087", "id2": "24699444", "id3": "24698168"}
# )

# print(strTemplate.template)
# print(strTemplate.extract_variable_values(strInstance2))
# print(
#     strTemplate.evaluate(
#         {
#             "id1": {"default": "24697087"},
#             "id2": {"default": "24695444"},
#             "id3": {"default": "24098168"},
#         }
#     )
# )

# strInstance1 = '{"placements":[{"divName":"homepage-header","zoneIds":[307172],"count":3,"networkId":"10457","siteId":"1121954","adTypes":[5],"properties":{}}],"user":{"key":"2338f480-4e9a-11ef-840b-1584b0c06ae4"}}'
# strInstance2 = '{"placements":[{"divName":"homepage-header","zoneIds":[307172],"count":3,"networkId":"10457","siteId":"1121954","adTypes":[5],"properties":{}}],"user":{"key":"7e615c80-598f-11ef-b23e-9bfff8511021"}}'

# strTemplate = StringTemplate.build(
#     strInstance1, {"userkey": "2338f480-4e9a-11ef-840b-1584b0c06ae4"}
# )

# print(strTemplate.template)
# print(strTemplate.extract_variable_values(strInstance2))
# print(strTemplate.evaluate({"id1": "24697087", "id2": "24695444", "id3": "24098168"}))
