import sys
import os

sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from swap_candidate import StringTemplate


def test_string_template():

    # escaping special characters
    strInstance1 = '{"placements":[{"divName":"homepage-header","zoneIds":[307172],"count":3,"networkId":"10457","siteId":"1121954","adTypes":[5],"properties":{}}],"user":{"key":"2338f480-4e9a-11ef-840b-1584b0c06ae4"}}'
    strInstance2 = '{"placements":[{"divName":"homepage-header","zoneIds":[307172],"count":3,"networkId":"10457","siteId":"1121954","adTypes":[5],"properties":{}}],"user":{"key":"7e615c80-598f-11ef-b23e-9bfff8511021"}}'

    strTemplate = StringTemplate.build(
        strInstance1, {"userkey": "2338f480-4e9a-11ef-840b-1584b0c06ae4"}
    )

    assert (
        strTemplate.template
        == '\\{"placements":\\[\\{"divName":"homepage\\-header","zoneIds":\\[307172\\],"count":3,"networkId":"10457","siteId":"1121954","adTypes":\\[5\\],"properties":\\{\\}\\}\\],"user":\\{"key":"(?P<userkey__0>[^/]+)"\\}\\}'
    )
    assert strTemplate.extract_variable_values(strInstance2) == {
        "userkey": "7e615c80-598f-11ef-b23e-9bfff8511021"
    }

    # escaping test 2

    strInstance1 = "ids%5B%5D=24698087&ids%5B%5D=24699444&ids%5B%5D=24698168"
    strInstance2 = "ids%5B%5D=24697087&ids%5B%5D=24695444&ids%5B%5D=24098168"

    strTemplate = StringTemplate.build(
        strInstance1, {"id1": "24698087", "id2": "24699444", "id3": "24698168"}
    )

    assert (
        strTemplate.template
        == "ids%5B%5D=(?P<id1__0>[^/]+)\\&ids%5B%5D=(?P<id2__0>[^/]+)\\&ids%5B%5D=(?P<id3__0>[^/]+)"
    )

    assert strTemplate.extract_variable_values(strInstance2) == {
        "id1": "24697087",
        "id2": "24695444",
        "id3": "24098168",
    }
