# neoorm.js

It's an basic Neo4j **ORM** designed to work in an asynchronous enviroment.


# Limitations

This is an early version, so there are some limitations you need to known before:

* **Neo4j 2.0**: neoorm.js works only with Neo4j 2+ and uses Cypher
* **Schema**: it's not implemented yet (I would write something like mongoose.js)
* **Nodes**: a node can have only a label
* **Relationships**: you can't save multiple relationship of the same type between two nodes
* **Models**: You need to declare all the Node and Relationship models before use it


# Goals

With the next releases I would:

* have a well working schema implementation for Nodes and Relationships
* be able to ensure declared relationships between nodes
* allow connections to Neo4j using HTTP authentication (usefull if you've a proxy in front of the Neo4j REST API)

I will be very happy if:

* someone could help me making this library better
* I can use multiple labels for each node


# Installation

First install node.js and neo4j. Then:

```sh
$ npm install neoogm
```


# Example

First, we need to configure a database connection `neoogm.config`

```javascript
neoogm.config({
	host: "my-remote.host.com"
	post: 12432
});
```

_Read more about [neoogm.config](#neoogm-config)_

Now you need to define a model for every nodes you need to use in the application:

```javascript
Actor = neoogm.node('Actor', {
	schema: {
		first_name: String,
		last_name: String
	},
	strict: true,
	created_at: true,
	updated_at: true
});
Movie = neoogm.node('Movie', {
	schema: {
		name: String
	},
	strict: true,
	created_at: true,
	updated_at: true
});
```

_Read more about [neoogm.node](#neoogm-node)_

Then we have to declare a model for every relations:

```javascript
RelPlayed = neoogm.relationship('PLAYED', {
	relates: [
		'Actor -> Movie'
	],
	schema: {
		role: String		
	}
});
```

_Read more about [neoogm.relationship](#neoogm-relationship)_

Now you're ready to create actors and movies:

```javascript
neo = new Actor({
	first_name: 'Keanu',
	last_name: 'Reeves'
});
matrix = new Movie({
	name: 'The matrix'
});
```

...and create relationships between nodes:

```javascript
neoAct = new RelPlayed({
	_start: neo,
	_end: matrix,
	role: 'Neo'
});
neoAct.save(function (err, item) {
	if (err) {
		return console.log("There was a problem: ", err);
	}
	console.log("Relationship saved: ", item);
});
```


# Summary

* [Configuration](#configuration)
	* neoogm.config(options = {})
* [Node model](#node-model)
	* Model = neoogm.node(name, [options = {}])
		* create(data = {}, callback)
		* update(options = {}, callback)
		* delete(options = {}, callback)
		* find(options = {}, callback)
		* findById(id, callback)
		* findByIdAndRemove(id, callback)
		* findByIdAndUpdate(id, data = {}, callback)
	* new Model(data = {})
		* save(callback)
		* remove(callback)
		* findOutgoing(options = {}, callback)
		* findIncoming(options = {}, callback)
		* findRelates(options = {}, callback)
		* getId()
		* getLabel()
* [Node utils](#node-utils)
	* neoogm.findNodeById(id, callback)
* [Relationship model](#relationship-model)
	* Rel = neoogm.relationship(name, [options = {}])
		* ~~findOutgoing(options = {}, callback)~~ *to be enhanced*
		* ~~findIncoming(options = {}, callback)~~ *to be enhanced*
		* ~~findRelates(options = {}, callback)~~ *to be enhanced*
		* ~~create()~~ *to be implemented*
		* ~~update()~~ *to be implemented*
		* ~~delete()~~ *to be implemented*
	* new Rel(data = {})
		* save(callback)
		* remove(callback)
		* getId()
		* getType()
		* getStart(callback)
		* getEnd(callback)
* [Relationship utils](#relationship-utils)
	* neoogm.findRelationshipById(id, callback)
* [Cypher query](#cypher-query)
	* neoogm.cypher(options = {}, callback)


# Configuration

## neoogm.config(options = {})

You can configure the library behavior.

**Examples:**

```javascript
neoogm.config({
	node: {
		created_at: true,
		updated_at: true
	}
});
```

**Options Hash (options):**

* **host** (String) — Hostname of the remote Neo4j database. Default is ``localhost``
* **port** (Integer) — Port number of the remote Neo4j database. Default is ``7474``
* **secure** (Boolean) — Enable or disable HTTPS. Default is ``false``
* **node** (Object) — Default behavior for node models:
	* **created_at** (Boolean or String) — create and save an ``created_at`` Date.now() property. When ``true`` neoorm.js create a property named ``cretated_at``, but you can change this name passing an string
	* **updated_at** (Boolean or String) — create and save an ``updated_at`` Date.now() property. When ``true`` the library create a property named ``updated_at``, but you can change this name passing an string
* **relationship** (Object) - Default behavior for relationship models
	* **created_at** (Boolean or String) — see ``node.created_at``
	* **updated_at** (Boolean or String) — see ``node.updated_at``


# Node model

## neoogm.model(name, [options = {}])

Used to define or retrieve a ORM model.

**Examples:**

```javascript
Actor = neoogm.node('Actor', {
	schema: {
		first_name: String,
		last_name: String,
		sex: String
	},
	strict: true,
	created_at: true,
	updated_at: true
});
ActorTest = neoogm.node('Actor');

console.log(Actor === ActorTest ? "Is the same" : "Error?!?");
```

**Options Hash (options):**

* **schema** (Object) — have to be completed, if you're in ``strict`` mode, neoorm.js save into the remote database only the declared keys found in the schema.
* **scrict** (Boolean) — partially implemented right now
* **created_at** (Boolean or String) — overwrite the default ``node.created_at`` property defined with ``neoorm.config()``
* **updated_at** (Boolean or String) — overwrite the default ``node.updated_at`` property defined with ``neoorm.config()``

## Model.create(data = {}, callback)

Create one or more models and save it in the database.

**Examples:**

```javascript
Actor.create([{
	first_name: 'Keanu',
	last_name: 'Reeves'
}, {
	first_name: 'Johnny',
	last_name: 'Depp'
}], function (err, items) {
	if (err)
		return console.error("Error: ", err);
	console.log("Saved ", items.length, " actors: ", items);
});
```

**Properties:**

* **data** (Object or Array of Objects) — Item or items to save in the database

**Callback (callback):**

```javascript
function (err, items) {};
```

## Model.update(options = {}, callback)

Update one or more nodes.

**Example:**

```javascript
Actor.update({
	query: {
		first_name: 'Johnny',
		last_name: 'Depp'
	}
	data: {
		sex: 'Male'
	}
}, function (err, items) {
	if (err)
		return console.error("Error: ", err);
	console.log("Updated ", items.length, " actors: ", items);
});
Actor.update({
	query: "first_name = {first_name}",
	params: {
		first_name: 'Johnny'
	}
	data: {
		sex: 'Male'
	}
}, function (err, items) {
	if (err)
		return console.error("Error: ", err);
	console.log("Updated ", items.length, " actors: ", items);
});
```

**Parameters:**

* **options** (Object)
	* **query** (String, Array or Object) — filter rules, can be:
		* ***String*** — a Cypher query string to append after the WHERE clause; this string can have params like ``{sex}`` (see ``params``)
		* ***Array*** — with complex query can be usefull pass an array of strings; their are joined together
		* ***Object*** — when you want alter all the models with a ``=`` match rule, you can pass an hash of key (field name) and values)
	* **params** (Object) — list of keys (param name) and values to replace in a query string.
	* **data** (Object) - list of keys (field name) and values to replace into the found models

**Callback (callback):**

```javascript
function (err, items) {};
```

## Model.delete(options = {}, callback)

Delete one or more nodes.

**Example:**

```javascript
Actor.delete({
	query: {
		first_name: 'Johnny',
		last_name: 'Depp'
	}
}, function (err, items) {
	if (err)
		return console.error("Error: ", err);
	console.log("Deleted ", items.length, " actors: ", items);
});
```

**Parameters:**

* **options** (Object)
	* **query** (String, Array or Object) — same of ``Model.update()``
	* **params** (Object) — list of keys (param name) and values to replace in a query string.

**Callback (callback):**

```javascript
function (err, items) {};
``` 
```

## Model.find(options = {}, callback)

Find one or more nodes.

**Example:**

```javascript
Actor.find({
	query: {
		first_name: 'Johnny',
		last_name: 'Depp'
	}
}, function (err, items) {
	if (err)
		return console.error("Error: ", err);
	console.log("Found ", items.length, " actors: ", items);
});
```

**Parameters:**

* **options** (Object)
	* **query** (String, Array or Object) — same of ``Model.update()``	* **params** (Object) — list of keys (param name) and values to replace in a query string.

**Callback (callback):**

```javascript
function (err, items) {};
``` 

## Model.findById(id, callback)

Find a node by Id.

**Example:**

```javascript
Actor.findById(12, function (err, item) {
	if (err)
		return console.error("Error: ", err);
	console.log("Found: ", item);
});
```

**Parameters:**

* **id** (Integer) — node Id

**Callback (callback):**

```javascript
function (err, item) {};
``` 
``` 

## Model.findByIdAndRemove(id, callback)

Find a node by Id and remove.

**Example:**

```javascript
Actor.findByIdAndRemove(12, function (err, item) {
	if (err)
		return console.error("Error: ", err);
	console.log("Removed: ", item);
});
```

**Parameters:**

* **id** (Integer) — node Id

**Callback (callback):**

```javascript
function (err, item) {};
``` 

## Model.findByIdAndUpdate(id, data = {}, callback)

Find a node by Id and update.

**Example:**

```javascript
Actor.findByIdAndUpdate(12, {
	sex: "Male"
} ,function (err, item) {
	if (err)
		return console.error("Error: ", err);
	console.log("Updated(", item.getId(), "): ", item);
});
```

**Parameters:**

* **id** (Integer) — node Id
* **data** (Object) — keys to update

**Callback (callback):**

```javascript
function (err, item) {};
``` 

## model = new Model(data = {})

Create a new model instance

**Example:**

```javascript
new Actor({
	first_name: "Johnny",
	last_name: "Depp"
});
```

**Parameters:**

* **data** (Object) — list of properties

**Return:**

A new Relationship model instance

## model.save(callback)

Create or update model properties in the database

**Example:**

```javascript
model.save(function (err, item) {
	if (err)
		return console.error("Error: ", err);
	console.log("Updated(", item.getId(), "): ", item);
});
```

**Callback (callback):**

```javascript
function (err, item) {};
``` 

## model.remove(callback)

Remove item from the database

**Example:**

```javascript
model.remove(function (err, item) {
	if (err)
		return console.error("Error: ", err);
	console.log("Removed: ", item);
});
```

**Callback (callback):**

```javascript
function (err, item) {};
``` 

## model.findOutgoing(options = {}, callback)

Find all outgoing relationships

**Example:**

```javascript
model.findOutgoing({
	type: 'PLAYED'
}, function (err, items) {
	if (err)
		return console.error("Error: ", err);
	console.log("Item founds: ", items);
});
```

**Parameters:**

* **options** (Object)
	* **type** (String) — Relationship type to be found
	* **query** (String, Array or Object) — same of ``Model.update()``
	* **params** (Object) — list of keys (param name) and values to replace in a query string.

**Callback (callback):**

```javascript
function (err, items) {};
``` 

## model.findIncoming(options = {}, callback)

Find all incoming relationships

**Parameters:**

* **options** (Object)
	* **type** (String) — Relationship type to be found
	* **query** (String, Array or Object) — same of ``Model.update()``
	* **params** (Object) — list of keys (param name) and values to replace in a query string.

**Callback (callback):**

```javascript
function (err, items) {};
``` 

## model.findRelates(options = {}, callback)

Find all incoming and outgoing relationships

**Parameters:**

* **options** (Object)
	* **type** (String) — Relationship type to be found
	* **query** (String, Array or Object) — same of ``Model.update()``
	* **params** (Object) — list of keys (param name) and values to replace in a query string.

**Callback (callback):**

```javascript
function (err, items) {};
``` 

## model.getId()

Get the current item Id

## model.getLabel()

Get the name of the label/model appley to the the current item

# Node utils

## neoogm.findNodeById(id, callback)

Find an node by Id and get back a node model instance.

**Example:**

```javascript
neoogm.findNodeById(12, function (err, item) {
	if (err)
		return console.error("Error: ", err);
	console.log("Found a ", item.getLabel(), ": ", item);
});
```

**Parameters:**

* **id** (Integer) — node Id

**Callback (callback):**

```javascript
function (err, item) {};
``` 

# Relationship model

## neoogm.relationship(name, [options = {}])

Used to define or retrieve a ORM relationship.

**Examples:**

```javascript
RelPlayed = neoogm.relationship('PLAYED', {
	relates: [
		'Actor -> Movie'
	],
	schema: {
		role: String		
	}
});
```

**Options Hash (options):**

* **relates** (Array of strings) — List of outgoing relationships between nodes
* **schema** (Object) — have to be completed, if you're in ``strict`` mode, neoorm.js save into the remote database only the declared keys found in the schema.
* **scrict** (Boolean) — partially implemented right now
* **created_at** (Boolean or String) — overwrite the default ``relationship.created_at`` property defined with ``neoorm.config()``
* **updated_at** (Boolean or String) — overwrite the default ``relationship.updated_at`` property defined with ``neoorm.config()``


## rel = new Rel(data = {})

Create a new model instance

**Example:**

```javascript
async.parallel([
	function (cb)
	{
		Actor.findById(12, cb);
	},
	function (cb)
	{
		Movie.findById(7, cb);
	}
], function (err, nodes) {
	if (err)
		return console.error(err);
	neo = new RelPlayed({
		rule: "Neo",
		_start: nodes[0],
		_end: nodes[1]
	});
	neo.save(function(err, rel)
	{
		if (err)
			return console.error(err);
		console.log("Saved ", rep);
	});
});
```

**Parameters:**

* **data** (Object) — list of properties
	* **_start** (Integer or Node Model) — List of outgoing relationships between nodes
	* **_end** (Integer or Node Model) — have to be completed, if you're in ``strict`` mode, neoorm.js save into the remote database only the declared keys found in the schema.

**Return:**

A new Relationship model instance

## rel.save(callback)

Create or update relationship properties in the database

**Example:**

```javascript
neo.save(function (err, item) {
	if (err)
		return console.error("Error: ", err);
	console.log("Updated(", item.getId(), "): ", item);
});
```

**Callback (callback):**

```javascript
function (err, item) {};
``` 

## rel.remove(callback)

Remove relationship from the database

**Example:**

```javascript
neo.remove(function (err, rel) {
	if (err)
		return console.error("Error: ", err);
	console.log("Removed: ", rel);
});
```

**Callback (callback):**

```javascript
function (err, item) {};
``` 

## model.getId()

Get the current item Id

## model.getType()

Get the type of the relationship/model appley to the the current item

## model.getStart(callback)

Get the related node

**Callback (callback):**

```javascript
function (err, item) {};
``` 

## model.getEnd(callback)

Get the related node

**Callback (callback):**

```javascript
function (err, item) {};
``` 


# Relationship utils

## neoogm.findRelationshipById(id, callback)

Find an relationship by Id and get back a relationship model instance.

**Example:**

```javascript
neoogm.findRelationshipById(44, function (err, item) {
	if (err)
		return console.error("Error: ", err);
	console.log("Found a ", item.getType(), ": ", item);
});
```

**Parameters:**

* **id** (Integer) — relationship Id

**Callback (callback):**

```javascript
function (err, item) {};
``` 


# Cypher query

## neoogm.cypher(options = {}, callback)

Send a cypher query to the remote database

**Examples:**

```javascript
neoogm.query("START n = node(2) RETURN n", function(err, items)
{
	if (err)
		return console.error(err);
	console.log('Items: ', items.length, items);
});
```

**Options Hash (options):**

* **one** (Boolean) — Limit query to one item (callback will return an object insted of an array of objects)
* **query** (String, Array or Object) — filter rules, can be:
	* ***String*** — a Cypher query string to append after the WHERE clause; this string can have params like ``{name}`` (see ``params``)
	* ***Array*** — with complex query can be usefull pass an array of strings; their are joined together
	* ***Object*** — when you want alter all the models with a ``=`` match rule, you can pass an hash of key (field name) and values)
* **params** (Object) — list of keys (param name) and values to replace in a query string.
* **model** (Array) — list of model names to wrap RETURN values

**Callback (callback):**

```javascript
function (err, items) {};
``` 
