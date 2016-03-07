/**
 * @license Copyright (c) 2003-2016, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

import clone from '../lib/lodash/clone.js';
import CKEditorError from '../ckeditorerror.js';

/**
 * SchemaItem is a singular registry item in {@link core.treeModel.Schema} that groups and holds allow/disallow rules for
 * one entity. This class is used internally in {@link core.treeModel.Schema} and should not be used outside it.
 *
 * @see core.treeModel.Schema
 * @memberOf core.treeModel
 */
export class SchemaItem {
	/**
	 * Creates SchemaItem instance.
	 *
	 * @param {core.treeModel.Schema} schema Schema instance that owns this item.
	 */
	constructor( schema ) {
		/**
		 * Schema instance that owns this item.
		 *
		 * @member {core.treeModel.Schema} core.treeModel.SchemaItem#_schema
		 * @private
		 */
		this._schema = schema;

		/**
		 * Paths in which the entity, represented by this item, is allowed.
		 *
		 * @member {Array} core.treeModel.SchemaItem#_allowed
		 * @private
		 */
		this._allowed = [];

		/**
		 * Paths in which the entity, represented by this item, is disallowed.
		 *
		 * @member {Array} core.treeModel.SchemaItem#_disallowed
		 * @private
		 */
		this._disallowed = [];
	}

	/**
	 * Allows entity, represented by this item, to be in given path.
	 *
	 * @param {Array.<String>|String} path Path in which entity is allowed. String with item names separated by spaces may be passed.
	 * @param {String} [attribute] If set, this path will be used only for entities that have an attribute with this key.
	 */
	addAllowed( path, attribute ) {
		this._addPath( '_allowed', path, attribute );
	}

	/**
	 * Disallows entity, represented by this item, to be in given path.
	 *
	 * @param {Array.<String>|String} path Path in which entity is disallowed. String with item names separated by spaces may be passed.
	 * @param {String} [attribute] If set, this path will be used only for entities that have an attribute with this key.
	 */
	addDisallowed( path, attribute ) {
		this._addPath( '_disallowed', path, attribute );
	}

	/**
	 * Adds path to the SchemaItem instance.
	 *
	 * @param {String} member Name of the array member into which the path will be added. Possible values are `_allowed` or `_disallowed`.
	 * @param {Array.<String>|String} path Path to be added. String with item names separated by spaces may be passed.
	 * @param {String} [attribute] If set, this path will be used only for entities that have an attribute with this key.
	 * @private
	 */
	_addPath( member, path, attribute ) {
		if ( typeof path === 'string' ) {
			path = path.split( ' ' );
		}

		path = path.slice();

		this[ member ].push( { path, attribute } );
	}

	/**
	 * Returns all paths of given type that were previously registered in the item.
	 *
	 * @param {String} type Paths' type. Possible values are `ALLOW` or `DISALLOW`.
	 * @param {String} [attribute] If set, only paths registered for given attribute will be returned.
	 * @returns {Array} Paths registered in the item.
	 * @private
	 */
	_getPaths( type, attribute ) {
		const source = type === 'ALLOW' ? this._allowed : this._disallowed;
		const paths = [];

		for ( let item of source ) {
			if ( item.attribute === attribute ) {
				paths.push( item.path.slice() );
			}
		}

		return paths;
	}

	/**
	 * Checks whether this item has any registered path of given type that matches provided path.
	 *
	 * @param {String} type Paths' type. Possible values are `ALLOW` or `DISALLOW`.
	 * @param {Array.<String>} checkPath Path to check.
	 * @param {String} [attribute] If set, only paths registered for given attribute will be returned.
	 * @returns {Boolean} `true` if item has any registered matching path, `false` otherwise.
	 * @private
	 */
	_hasMatchingPath( type, checkPath, attribute ) {
		const itemPaths = this._getPaths( type, attribute );

		checkPath = checkPath.slice();

		// We check every path registered (possibly with given attribute) in the item.
		for ( let itemPath of itemPaths ) {
			// We have one of paths registered in the item.

			// Now we have to check every item name from the path to check.
			for ( let checkName of checkPath ) {
				// Every item name is expanded to all names of items that item is extending.
				// So, if on item path, there is an item that is extended by item from checked path, it will
				// also be treated as matching.
				const chain = this._schema._extensionChains.get( checkName );

				// Since our paths have to match in given order, we always check against first item from item path.
				// So, if item path is: B D E
				// And checked path is: A B C D E
				// It will be matching (A won't match, B will match, C won't match, D and E will match)
				if ( chain.indexOf( itemPath[ 0 ] ) > -1 ) {
					// Every time we have a match, we remove it from `itemPath` so we can still check against first item.
					itemPath.shift();
				}
			}

			// If `itemPath` has no items it means that we removed all of them, so we matched all of them.
			// This means that we found a matching path.
			if ( itemPath.length === 0 ) {
				return true;
			}
		}

		// No matching path found.
		return false;
	}

	/**
	 * Custom toJSON method to solve child-parent circular dependencies.
	 *
	 * @returns {Object} Clone of this object with the parent property replaced with its name.
	 */
	toJSON() {
		const json = clone( this );

		// Due to circular references we need to remove parent reference.
		json._schema = '[treeModel.Schema]';

		return json;
	}
}

/**
 * Schema is a run-time created and modified description of which entity in Tree Model is allowed to be inside another
 * entity. It is checked to verify whether given action can be preformed on Tree Model or whether Tree Model
 * is in correct state.
 *
 * Schema consist of {@link core.treeModel.SchemaItem schema items}, each describing different entity. Entity can be
 * either a Tree Model element or an abstract group for similar elements. Entities are represented by names. Names
 * of special/abstract entities should be prefixed by `$` sign.
 *
 * Each entity in Schema may have a set of allow/disallow rules. Every rule describes in which entities given entity
 * can or cannot be.
 *
 * Entities can extend other entities. This mechanism allows for grouping entities under abstract names. Whenever a rule
 * is applied to entity, it is also true for all other entities that extends that entity. For example, let's assume there is
 * entity named `$block` and entity `div` extends `$block`. If we add a rule, that entity `$text` with attribute `myAttr`
 * is allowed in `$block`, it will also be allowed in `div` (and all other entities extending `$block`). It would be
 * possible to disallow `$text` with `myAttr` in `div` by explicitly adding disallow rule for `$text` with `myAttr` in `$block`.
 *
 * @memberOf core.TreeModel
 */
export default class Schema {
	/**
	 * Creates Schema instance.
	 */
	constructor() {
		/**
		 * Schema items registered in the schema.
		 *
		 * @member {Map} core.treeModel.Schema#_items
		 * @private
		 */
		this._items = new Map();

		/**
		 * Description of what entities are a base for given entity.
		 *
		 * @member {Map} core.treeModel.Schema#_extensionChains
		 * @private
		 */
		this._extensionChains = new Map();

		// Register some default abstract entities.
		this.registerItem( '$inline', null );
		this.registerItem( '$block', null );
		this.registerItem( '$text', '$inline' );

		// Allow inline elements inside block elements.
		this.allow( { name: '$inline', inside: '$block' } );
	}

	/**
	 * Allows given query in the schema.
	 *
	 *		// Allow text with bold attribute in all P elements.
	 *		schema.registerItem( 'p', '$block' );
	 *		schema.allow( { name: '$text', attribute: 'bold', inside: 'p' } );
	 *
	 *		// Allow header in Ps that are in DIVs
	 *		schema.registerItem( 'header', '$block' );
	 *		schema.registerItem( 'div', '$block' );
	 *		schema.allow( { name: 'header', inside: 'div p' } ); // inside: [ 'div', 'p' ] would also work.
	 *
	 * @param {core.treeModel.SchemaQuery} query Allowed query.
	 */
	allow( query ) {
		this._getItem( query.name ).addAllowed( query.inside, query.attribute );
	}

	/**
	 * Disallows given query in the schema.
	 *
	 * @see {@link core.treeModel.Schema#allow}
	 * @param {core.treeModel.SchemaQuery} query Disallowed query.
	 */
	disallow( query ) {
		this._getItem( query.name ).addDisallowed( query.inside, query.attribute );
	}

	/**
	 * Checks whether entity with given name (and optionally, with given attribute) is allowed at given position.
	 *
	 *		// Check whether bold text can be placed at caret position.
	 *		let caretPos = editor.document.selection.getFirstPosition();
	 *		if ( schema.checkAtPosition( caretPos, '$text', 'bold' ) ) { ... }
	 *
	 * @param {core.treeModel.Position} position Position to check at.
	 * @param {String} name Entity name to check.
	 * @param {String} [attribute] If set, schema will check for entity with given attribute.
	 * @returns {Boolean} `true` if entity is allowed, `false` otherwise
	 */
	checkAtPosition( position, name, attribute ) {
		if ( !this.hasItem( name ) ) {
			return false;
		}

		return this.checkQuery( {
			name: name,
			inside: Schema._makeItemsPathFromPosition( position ),
			attribute: attribute
		} );
	}

	/**
	 * Checks whether given query is allowed in schema.
	 *
	 *		// Check whether bold text is allowed in header element.
	 *		let query = {
	 *			name: '$text',
	 *			attribute: 'bold',
	 *			inside: 'header'
	 *		};
	 *		if ( schema.checkQuery( query ) ) { ... }
	 *
	 * @param {core.treeModel.SchemaQuery} query Query to check.
	 * @returns {Boolean} `true` if given query is allowed in schema, `false` otherwise.
	 */
	checkQuery( query ) {
		if ( !this.hasItem( query.name ) ) {
			return false;
		}

		const path = ( typeof query.inside === 'string' ) ? query.inside.split( ' ' ) : query.inside;

		// Get extension chain of given item and retrieve all schema items that are extended by given item.
		const schemaItems = this._extensionChains.get( query.name ).map( ( name ) => {
			return this._getItem( name );
		} );

		// If there is matching disallow path, this query is not valid with schema.
		for ( let schemaItem of schemaItems ) {
			if ( schemaItem._hasMatchingPath( 'DISALLOW', path, query.attribute ) ) {
				return false;
			}
		}

		// At this point, the query is not disallowed.
		// If there is any allow path that matches query, this query is valid with schema.
		for ( let schemaItem of schemaItems ) {
			if ( schemaItem._hasMatchingPath( 'ALLOW', path, query.attribute ) ) {
				return true;
			}
		}

		// There are no allow paths that matches query. The query is not valid with schema.
		return false;
	}

	/**
	 * Checks whether there is an item registered under given name in schema.
	 *
	 * @param itemName
	 * @returns {boolean}
	 */
	hasItem( itemName ) {
		return this._items.has( itemName );
	}

	/**
	 * Registers given item name in schema.
	 *
	 *		// Register P element that should be treated like all block elements.
	 *		schema.registerItem( 'p', '$block' );
	 *
	 * @param {String} itemName Name to register.
	 * @param [isExtending] If set, new item will extend item with given name.
	 */
	registerItem( itemName, isExtending ) {
		if ( this.hasItem( itemName ) ) {
			/**
			 * Item with specified name already exists in schema.
			 *
			 * @error schema-item-exists
			 */
			throw new CKEditorError( 'schema-item-exists: Item with specified name already exists in schema.' );
		}

		if ( !!isExtending && !this.hasItem( isExtending ) ) {
			/**
			 * Item with specified name does not exist in schema.
			 *
			 * @error schema-no-item
			 */
			throw new CKEditorError( 'schema-no-item: Item with specified name does not exist in schema.' );
		}

		// Create new SchemaItem and add it to the items store.
		this._items.set( itemName, new SchemaItem( this ) );

		// Create an extension chain.
		// Extension chain has all item names that should be checked when that item is on path to check.
		// This simply means, that if item is not extending anything, it should have only itself in it's extension chain.
		// Since extending is not dynamic, we can simply get extension chain of extended item and expand it with registered name,
		// if the registered item is extending something.
		const chain = this.hasItem( isExtending ) ? this._extensionChains.get( isExtending ).concat( itemName ) : [ itemName ];
		this._extensionChains.set( itemName, chain );
	}

	/**
	 * Returns {@link core.treeModel.SchemaItem schema item} that was registered in the schema under given name.
	 * If item has not been found, throws error.
	 *
	 * @param {String} itemName Name to look for in schema.
	 * @returns {core.treeModel.SchemaItem} Schema item registered under given name.
	 * @private
	 */
	_getItem( itemName ) {
		if ( !this.hasItem( itemName ) ) {
			/**
			 * Item with specified name does not exist in schema.
			 *
			 * @error schema-no-item
			 */
			throw new CKEditorError( 'schema-no-item: Item with specified name does not exist in schema.' );
		}

		return this._items.get( itemName );
	}

	/**
	 * Gets position and traverses through it's parents to get their names and returns them.
	 *
	 * @param {core.treeModel.Position} position Position to start building path from.
	 * @returns {Array.<String>} Path containing elements names from top-most to the one containing given position.
	 * @private
	 */
	static _makeItemsPathFromPosition( position ) {
		const path = [];
		let parent = position.parent;

		while ( parent !== null ) {
			path.push( parent.name );
			parent = parent.parent;
		}

		path.reverse();

		return path;
	}
}

/**
 * Object with query used by {@link core.treeModel.Schema} to query schema or add allow/disallow rules to schema.
 *
 * @typedef {Object} core.treeModel.SchemaQuery
 * @property {String} name Entity name.
 * @property {Array.<String>|String} inside Path inside which the entity is placed.
 * @property {String} [attribute] If set, the query applies only to entities that has attribute with given key.
 */
