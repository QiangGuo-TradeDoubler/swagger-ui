/* eslint-env mocha */
import expect from "expect"
import { fromJS } from "immutable"
import { fromJSOrdered } from "core/utils"
import {
  definitions,
  parameterValues,
  contentTypeValues,
  operationScheme,
  specJsonWithResolvedSubtrees,
  producesOptionsFor,
} from "corePlugins/spec/selectors"

import Petstore from "./assets/petstore.json"
import {
  operationWithMeta,
  parameterWithMeta,
  parameterWithMetaByIdentity,
  parameterInclusionSettingFor,
  consumesOptionsFor
} from "../../../../src/core/plugins/spec/selectors"

describe("spec plugin - selectors", function(){

  describe("definitions", function(){
    it("should return definitions by default", function(){

      // Given
      const spec = fromJS({
        json: {
          swagger: "2.0",
          definitions: {
            a: {
              type: "string"
            },
            b: {
              type: "string"
            }
          }
        }
      })

      // When
      let res = definitions(spec)

      // Then
      expect(res.toJS()).toEqual({
        a: {
          type: "string"
        },
        b: {
          type: "string"
        }
      })
    })
    it("should return an empty Map when missing definitions", function(){

      // Given
      const spec = fromJS({
        json: {
          swagger: "2.0"
        }
      })

      // When
      let res = definitions(spec)

      // Then
      expect(res.toJS()).toEqual({})
    })
    it("should return an empty Map when given non-object definitions", function(){

      // Given
      const spec = fromJS({
        json: {
          swagger: "2.0",
          definitions: "..."
        }
      })

      // When
      let res = definitions(spec)

      // Then
      expect(res.toJS()).toEqual({})
    })
  })

  describe("parameterValue", function(){

    it("should return Map({}) if no path found", function(){

      // Given
      const spec = fromJS({ })

      // When
      let paramValues = parameterValues(spec, ["/one", "get"])

      // Then
      expect(paramValues.toJS()).toEqual({})

    })

    it("should return a hash of [parameterName]: value", function(){

      // Given
      const spec = fromJS({
        json: {
          paths: {
            "/one": {
              get: {
                parameters: [
                  { name: "one", in: "query", value: 1},
                  { name: "two", in: "query", value: "duos"}
                ]
              }
            }
          }
        }
      })

      // When
      let paramValues = parameterValues(spec, ["/one", "get"])

      // Then
      expect(paramValues.toJS()).toEqual({
        "query.one": 1,
        "query.two": "duos"
      })

    })

  })

  describe("contentTypeValues", function(){
    it("should return { requestContentType, responseContentType } from an operation", function(){
      // Given
      let state = fromJS({
        json: {
          paths: {
            "/one": {
              get: {}
            }
          }
        },
        meta: {
          paths: {
            "/one": {
              get: {
                "consumes_value": "one",
                "produces_value": "two"
              }
            }
          }
        }
      })

      // When
      let contentTypes = contentTypeValues(state, [ "/one", "get" ])
      // Then
      expect(contentTypes.toJS()).toEqual({
        requestContentType: "one",
        responseContentType: "two"
      })
    })

    it("should default to the first `produces` array value if current is not set", function(){
      // Given
      let state = fromJS({
        json: {
          paths: {
            "/one": {
              get: {
                produces: [
                  "application/xml",
                  "application/whatever"
                ]
              }
            }
          }
        },
        meta: {
          paths: {
            "/one": {
              get: {
                "consumes_value": "one"
              }
            }
          }
        }
      })

      // When
      let contentTypes = contentTypeValues(state, [ "/one", "get" ])
      // Then
      expect(contentTypes.toJS()).toEqual({
        requestContentType: "one",
        responseContentType: "application/xml"
      })
    })

    it("should default to `application/json` if a default produces value is not available", function(){
      // Given
      let state = fromJS({
        json: {
          paths: {
            "/one": {
              get: {}
            }
          }
        },
        meta: {
          paths: {
            "/one": {
              get: {
                "consumes_value": "one"
              }
            }
          }
        }
      })

      // When
      let contentTypes = contentTypeValues(state, [ "/one", "get" ])
      // Then
      expect(contentTypes.toJS()).toEqual({
        requestContentType: "one",
        responseContentType: "application/json"
      })
    })

    it("should prioritize consumes value first from an operation", function(){
      // Given
      let state = fromJS({
        json: {
          paths: {
            "/one": {
              get: {
                "parameters": [{
                  "type": "file"
                }],
              }
            }
          }
        },
        meta: {
          paths: {
            "/one": {
              get: {
                "consumes_value": "one",
              }
            }
          }
        }
      })

      // When
      let contentTypes = contentTypeValues(state, [ "/one", "get" ])
      // Then
      expect(contentTypes.toJS().requestContentType).toEqual("one")
    })

    it("should fallback to multipart/form-data if there is no consumes value but there is a file parameter", function(){
      // Given
      let state = fromJS({
        json: {
          paths: {
            "/one": {
              get: {
                "parameters": [{
                  "type": "file"
                }],
              }
            }
          }
        }
      })

      // When
      let contentTypes = contentTypeValues(state, [ "/one", "get" ])
      // Then
      expect(contentTypes.toJS().requestContentType).toEqual("multipart/form-data")
    })

    it("should fallback to application/x-www-form-urlencoded if there is no consumes value, no file parameter, but there is a formData parameter", function(){
      // Given
      let state = fromJS({
        json: {
          paths: {
            "/one": {
              get: {
                "parameters": [{
                  "type": "formData"
                }],
              }
            }
          }
        }
      })

      // When
      let contentTypes = contentTypeValues(state, [ "/one", "get" ])
      // Then
      expect(contentTypes.toJS().requestContentType).toEqual("application/x-www-form-urlencoded")
    })

    it("should return nothing, if the operation does not exist", function(){
      // Given
      let state = fromJS({ })

      // When
      let contentTypes = contentTypeValues(state, [ "/one", "get" ])
      // Then
      expect(contentTypes.toJS()).toEqual({
        requestContentType: undefined,
        responseContentType: undefined
      })
    })

  })

  describe("operationScheme", function(){

    it("should return the correct scheme for a remote spec that doesn't specify a scheme", function(){
      // Given
      let state = fromJS({
        url: "https://generator.swagger.io/api/swagger.json",
        json: {
          paths: {
            "/one": {
              get: {
                "consumes_value": "one",
                "produces_value": "two"
              }
            }
          }
        }
      })

      // When
      let scheme = operationScheme(state, ["/one"], "get")
      // Then
      expect(scheme).toEqual("https")
    })

    // it("should be ok, if no operation found", function(){
    //   // Given
    //   let state = fromJS({ })
    //
    //   // When
    //   let contentTypes = contentTypeValues(state, [ "/one", "get" ])
    //   // Then
    //   expect(contentTypes.toJS()).toEqual({
    //     requestContentType: undefined,
    //     responseContentType: undefined
    //   })
    // })

  })

  describe("specJsonWithResolvedSubtrees", function(){

    it("should return a correctly merged tree", function(){
      // Given
      let state = fromJS({
        json: {
          definitions: {
            Asdf: {
              $ref: "#/some/path",
              randomKey: "this should be removed b/c siblings of $refs must be removed, per the specification",
              description: "same for this key"
            },
            Fgsfds: {
              $ref: "#/another/path"
            },
            OtherDef: {
              description: "has no refs"
            }
          }
        },
        resolvedSubtrees: {
          definitions: {
            Asdf: {
              type: "object",
              $$ref: "#/some/path"
            }
          }
        }
      })

      // When
      let result = specJsonWithResolvedSubtrees(state)
      // Then
      expect(result.toJS()).toEqual({
        definitions: {
          Asdf: {
            type: "object",
            $$ref: "#/some/path"
          },
          Fgsfds: {
            $ref: "#/another/path"
          },
          OtherDef: {
            description: "has no refs"
          }
        }
      })
    })
    it("should preserve initial map key ordering", function(){
      // Given
      let state = fromJSOrdered({
        json: Petstore,
        resolvedSubtrees: {
            paths: {
              "/pet/{petId}": {
                post: {
                  tags: [
                    "pet"
                  ],
                  summary: "Updates a pet in the store with form data",
                  description: "",
                  operationId: "updatePetWithForm",
                  consumes: [
                    "application/x-www-form-urlencoded"
                  ],
                  produces: [
                    "application/xml",
                    "application/json"
                  ],
                  parameters: [
                    {
                      name: "petId",
                      "in": "path",
                      description: "ID of pet that needs to be updated",
                      required: true,
                      type: "integer",
                      format: "int64"
                    },
                    {
                      name: "name",
                      "in": "formData",
                      description: "Updated name of the pet",
                      required: false,
                      type: "string"
                    },
                    {
                      name: "status",
                      "in": "formData",
                      description: "Updated status of the pet",
                      required: false,
                      type: "string"
                    }
                  ],
                  responses: {
                    "405": {
                      description: "Invalid input"
                    }
                  },
                  security: [
                    {
                      petstore_auth: [
                        "write:pets",
                        "read:pets"
                      ]
                    }
                  ],
                  __originalOperationId: "updatePetWithForm"
                }
              }
            }
        }
      })

      // When
      let result = specJsonWithResolvedSubtrees(state)

      // Then
      const correctOrder = [
        "/pet",
        "/pet/findByStatus",
        "/pet/findByTags",
        "/pet/{petId}",
        "/pet/{petId}/uploadImage",
        "/store/inventory",
        "/store/order",
        "/store/order/{orderId}",
        "/user",
        "/user/createWithArray",
        "/user/createWithList",
        "/user/login",
        "/user/logout",
        "/user/{username}"
      ]
      expect(state.getIn(["json", "paths"]).keySeq().toJS()).toEqual(correctOrder)
      expect(result.getIn(["paths"]).keySeq().toJS()).toEqual(correctOrder)
    })
  })

  describe("operationWithMeta", function() {
    it("should support merging in name+in keyed param metadata", function () {
      const state = fromJS({
        json: {
          paths: {
            "/": {
              "get": {
                parameters: [
                  {
                    name: "body",
                    in: "body"
                  }
                ]
              }
            }
          }
        },
        meta: {
          paths: {
            "/": {
              "get": {
                parameters: {
                  "body.body": {
                    value: "abc123"
                  }
                }
              }
            }
          }
        }
      })

      const result = operationWithMeta(state, "/", "get")

      expect(result.toJS()).toEqual({
        parameters: [
          {
            name: "body",
            in: "body",
            value: "abc123"
          }
        ]
      })
    })
    it("should support merging in hash-keyed param metadata", function () {
      const bodyParam = fromJS({
        name: "body",
        in: "body"
      })

      const state = fromJS({
        json: {
          paths: {
            "/": {
              "get": {
                parameters: [
                  bodyParam
                ]
              }
            }
          }
        },
        meta: {
          paths: {
            "/": {
              "get": {
                parameters: {
                  [`body.body.hash-${bodyParam.hashCode()}`]: {
                    value: "abc123"
                  }
                }
              }
            }
          }
        }
      })

      const result = operationWithMeta(state, "/", "get")

      expect(result.toJS()).toEqual({
        parameters: [
          {
            name: "body",
            in: "body",
            value: "abc123"
          }
        ]
      })
    })
  })
  describe("parameterWithMeta", function() {
    it("should support merging in name+in keyed param metadata", function () {
      const state = fromJS({
        json: {
          paths: {
            "/": {
              "get": {
                parameters: [
                  {
                    name: "body",
                    in: "body"
                  }
                ]
              }
            }
          }
        },
        meta: {
          paths: {
            "/": {
              "get": {
                parameters: {
                  "body.body": {
                    value: "abc123"
                  }
                }
              }
            }
          }
        }
      })

      const result = parameterWithMeta(state, ["/", "get"], "body", "body")

      expect(result.toJS()).toEqual({
        name: "body",
        in: "body",
        value: "abc123"
      })
    })
    it("should give best-effort when encountering hash-keyed param metadata", function () {
      const bodyParam = fromJS({
        name: "body",
        in: "body"
      })

      const state = fromJS({
        json: {
          paths: {
            "/": {
              "get": {
                parameters: [
                  bodyParam
                ]
              }
            }
          }
        },
        meta: {
          paths: {
            "/": {
              "get": {
                parameters: {
                  [`body.body.hash-${bodyParam.hashCode()}`]: {
                    value: "abc123"
                  }
                }
              }
            }
          }
        }
      })

      const result = parameterWithMeta(state, ["/", "get"], "body", "body")

      expect(result.toJS()).toEqual({
        name: "body",
        in: "body",
        value: "abc123"
      })
    })

  })
  describe("parameterWithMetaByIdentity", function() {
    it("should support merging in name+in keyed param metadata", function () {
      const bodyParam = fromJS({
        name: "body",
        in: "body"
      })

      const state = fromJS({
        json: {
          paths: {
            "/": {
              "get": {
                parameters: [bodyParam]
              }
            }
          }
        },
        meta: {
          paths: {
            "/": {
              "get": {
                parameters: {
                  "body.body": {
                    value: "abc123"
                  }
                }
              }
            }
          }
        }
      })

      const result = parameterWithMetaByIdentity(state, ["/", "get"], bodyParam)

      expect(result.toJS()).toEqual({
        name: "body",
        in: "body",
        value: "abc123"
      })
    })
    it("should support merging in hash-keyed param metadata", function () {
      const bodyParam = fromJS({
        name: "body",
        in: "body"
      })

      const state = fromJS({
        json: {
          paths: {
            "/": {
              "get": {
                parameters: [
                  bodyParam
                ]
              }
            }
          }
        },
        meta: {
          paths: {
            "/": {
              "get": {
                parameters: {
                  [`body.body.hash-${bodyParam.hashCode()}`]: {
                    value: "abc123"
                  }
                }
              }
            }
          }
        }
      })

      const result = parameterWithMetaByIdentity(state, ["/", "get"], bodyParam)

      expect(result.toJS()).toEqual({
        name: "body",
        in: "body",
        value: "abc123"
      })
    })
  })
  describe("parameterInclusionSettingFor", function() {
    it("should support getting {in}.{name} param inclusion settings", function () {
      const param = fromJS({
        name: "param",
        in: "query",
        allowEmptyValue: true
      })

      const state = fromJS({
        json: {
          paths: {
            "/": {
              "get": {
                parameters: [
                  param
                ]
              }
            }
          }
        },
        meta: {
          paths: {
            "/": {
              "get": {
                "parameter_inclusions": {
                  [`query.param`]: true
                }
              }
            }
          }
        }
      })

      const result = parameterInclusionSettingFor(state, ["/", "get"], "param", "query")

      expect(result).toEqual(true)
    })
  })
  describe("producesOptionsFor", function() {
    it("should return an operation produces value", function () {
      const state = fromJS({
        json: {
          paths: {
            "/": {
              "get": {
                description: "my operation",
                produces: [
                  "operation/one",
                  "operation/two",
                ]
              }
            }
          }
        }
      })

      const result = producesOptionsFor(state, ["/", "get"])

      expect(result.toJS()).toEqual([
        "operation/one",
        "operation/two",
      ])
    })
    it("should return a path item produces value", function () {
      const state = fromJS({
        json: {
          paths: {
            "/": {
              "get": {
                description: "my operation",
                produces: [
                  "path-item/one",
                  "path-item/two",
                ]
              }
            }
          }
        }
      })

      const result = producesOptionsFor(state, ["/", "get"])

      expect(result.toJS()).toEqual([
        "path-item/one",
        "path-item/two",
      ])
    })
    it("should return a global produces value", function () {
      const state = fromJS({
        json: {
          produces: [
            "global/one",
            "global/two",
          ],
          paths: {
            "/": {
              "get": {
                description: "my operation"
              }
            }
          }
        }
      })

      const result = producesOptionsFor(state, ["/", "get"])

      expect(result.toJS()).toEqual([
        "global/one",
        "global/two",
      ])
    })
    it("should favor an operation produces value over a path-item value", function () {
      const state = fromJS({
        json: {
          paths: {
            "/": {
              produces: [
                "path-item/one",
                "path-item/two",
              ],
              "get": {
                description: "my operation",
                produces: [
                  "operation/one",
                  "operation/two",
                ]
              }
            }
          }
        }
      })

      const result = producesOptionsFor(state, ["/", "get"])

      expect(result.toJS()).toEqual([
        "operation/one",
        "operation/two",
      ])
    })
    it("should favor a path-item produces value over a global value", function () {
      const state = fromJS({
        json: {
          produces: [
            "global/one",
            "global/two",
          ],
          paths: {
            "/": {
              produces: [
                "path-item/one",
                "path-item/two",
              ],
              "get": {
                description: "my operation"
              }
            }
          }
        }
      })

      const result = producesOptionsFor(state, ["/", "get"])

      expect(result.toJS()).toEqual([
        "path-item/one",
        "path-item/two",
      ])
    })
  })
  describe("consumesOptionsFor", function() {
    it("should return an operation consumes value", function () {
      const state = fromJS({
        json: {
          paths: {
            "/": {
              "get": {
                description: "my operation",
                consumes: [
                  "operation/one",
                  "operation/two",
                ]
              }
            }
          }
        }
      })

      const result = consumesOptionsFor(state, ["/", "get"])

      expect(result.toJS()).toEqual([
        "operation/one",
        "operation/two",
      ])
    })
    it("should return a path item consumes value", function () {
      const state = fromJS({
        json: {
          paths: {
            "/": {
              "get": {
                description: "my operation",
                consumes: [
                  "path-item/one",
                  "path-item/two",
                ]
              }
            }
          }
        }
      })

      const result = consumesOptionsFor(state, ["/", "get"])

      expect(result.toJS()).toEqual([
        "path-item/one",
        "path-item/two",
      ])
    })
    it("should return a global consumes value", function () {
      const state = fromJS({
        json: {
          consumes: [
            "global/one",
            "global/two",
          ],
          paths: {
            "/": {
              "get": {
                description: "my operation"
              }
            }
          }
        }
      })

      const result = consumesOptionsFor(state, ["/", "get"])

      expect(result.toJS()).toEqual([
        "global/one",
        "global/two",
      ])
    })
    it("should favor an operation consumes value over a path-item value", function () {
      const state = fromJS({
        json: {
          paths: {
            "/": {
              consumes: [
                "path-item/one",
                "path-item/two",
              ],
              "get": {
                description: "my operation",
                consumes: [
                  "operation/one",
                  "operation/two",
                ]
              }
            }
          }
        }
      })

      const result = consumesOptionsFor(state, ["/", "get"])

      expect(result.toJS()).toEqual([
        "operation/one",
        "operation/two",
      ])
    })
    it("should favor a path-item consumes value over a global value", function () {
      const state = fromJS({
        json: {
          consumes: [
            "global/one",
            "global/two",
          ],
          paths: {
            "/": {
              consumes: [
                "path-item/one",
                "path-item/two",
              ],
              "get": {
                description: "my operation"
              }
            }
          }
        }
      })

      const result = consumesOptionsFor(state, ["/", "get"])

      expect(result.toJS()).toEqual([
        "path-item/one",
        "path-item/two",
      ])
    })
  })
})
