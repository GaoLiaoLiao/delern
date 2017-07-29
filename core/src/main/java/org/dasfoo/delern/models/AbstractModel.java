/*
 * Copyright (C) 2017 Katarina Sheremet
 * This file is part of Delern.
 *
 * Delern is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 *
 * Delern is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with  Delern.  If not, see <http://www.gnu.org/licenses/>.
 */

package org.dasfoo.delern.models;

import android.support.annotation.Nullable;

import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.Exclude;
import com.google.firebase.database.Query;

import org.dasfoo.delern.models.helpers.MultiWrite;
import org.dasfoo.delern.models.listeners.AbstractDataAvailableListener;
import org.dasfoo.delern.models.listeners.AbstractOnFBDataChangeListener;
import org.dasfoo.delern.models.listeners.OnOperationCompleteListener;

import java.util.ArrayList;
import java.util.List;

/**
 * Base class for models, implementing Firebase functionality.
 */
public abstract class AbstractModel {

    @Exclude
    private String mKey;

    @Exclude
    private AbstractModel mParent;

    /**
     * The only constructor.
     *
     * @param parent a parent model for this instance. There is a limited set of which classes
     *               are expected as parents, it's usually seen in custom getXXX methods.
     *               This parameter must not be null unless called in a form of super(null) from a
     *               private parameterless constructor used by Firebase.
     * @param key    a unique key assigned to the object by Firebase, or null if not yet assigned.
     */
    protected AbstractModel(@Nullable final AbstractModel parent, @Nullable final String key) {
        mParent = parent;
        mKey = key;
    }

    /**
     * Parse model from a database snapshot using getValue().
     *
     * @param snapshot a snapshot pointing to model data (not the list of models).
     * @param cls      a model class, e.g. Card.class or card.getClass().
     * @param parent   a parent model. See AbstractModel constructor for limitations.
     * @param <T>      an AbstractModel subclass.
     * @return an instance of T with key and parent set, or null.
     */
    public static <T extends AbstractModel> T fromSnapshot(final DataSnapshot snapshot,
                                                           final Class<T> cls,
                                                           final AbstractModel parent) {
        T model = snapshot.getValue(cls);
        if (model != null) {
            model.setKey(snapshot.getKey());
            model.setParent(parent);
        }
        return model;
    }

    /**
     * Count the child nodes (non-recursively) returned by the query.
     *
     * @param query    a DatabaseReference or a specific query.
     * @param callback a callback to run when data is available and then every time the count
     *                 changes. To stop the updates and save resources, call callback.cleanup().
     */
    public static void fetchCount(final Query query,
                                  final AbstractDataAvailableListener<Long> callback) {
        // TODO(refactoring): this should be childeventlistener, not valueeventlistener
        query.addValueEventListener(callback.setCleanupPair(query,
                new AbstractOnFBDataChangeListener(callback) {
                    @Override
                    public void onDataChange(final DataSnapshot dataSnapshot) {
                        callback.onData(dataSnapshot.getChildrenCount());
                    }
                }));
    }

    /**
     * Get the key assigned when fetching from or saving to the database.
     *
     * @return value of the key (usually a fairly random string).
     */
    @Exclude
    public String getKey() {
        return mKey;
    }

    /**
     * Set the known key for the model. This may be used internally by AbstractModel when saving
     * the new value to the database, or externally when unpacking the value from Parcel.
     * Another use case is when child model would set the key to a parent model when they share
     * the same key.
     *
     * @param key value of the key (usually a fairly random string).
     */
    @Exclude
    public void setKey(final String key) {
        this.mKey = key;
    }

    /**
     * Whether the model (supposedly) exists in the database.
     *
     * @return true if key is not null.
     */
    @Exclude
    public boolean exists() {
        return getKey() != null;
    }

    /**
     * Get a parent model assigned when this object is created, or by fromSnapshot when restoring
     * from the database. This method is usually overridden in subclasses to provide a fine-grained
     * parent access (i.e. with a specific class rather than just AbstractModel).
     *
     * @return AbstractModel
     */
    @Exclude
    public AbstractModel getParent() {
        return mParent;
    }

    /**
     * Set a parent model for this object. This method is not intended to be used directly, because
     * parent is a required parameter to the model's constructor. It is called internally in
     * fromSnapshot() because DataSnapshot.getValue() doesn't allow constructor parameters.
     *
     * @param parent parent model which is deserializing the value in fromSnapshot().
     */
    @Exclude
    protected void setParent(final AbstractModel parent) {
        mParent = parent;
    }

    /**
     * Return a value that should be saved to the database for this model. It's usually the same
     * object, but may be overwritten in child classes for trivial models or for performance.
     *
     * @return value to be written by Firebase to getKey() location/
     */
    @Exclude
    public Object getFirebaseValue() {
        return this;
    }

    /**
     * Get a DatabaseReference pointing to the root of all child nodes belonging to this parent.
     * There may be more levels of hierarchy between the reference returned and child objects in the
     * database. On a related note, child nodes are usually not under the parent node in JSON tree;
     * instead, they have their own path from the root of the database.
     *
     * @param childClass class of the child model.
     * @param <T>        class of the child model.
     * @return DatabaseReference pointing to the root of all child nodes (recursively).
     */
    public abstract <T> DatabaseReference getChildReference(Class<T> childClass);

    /**
     * Get a DatabaseReference pointing to a specific child node, or root of indirect child nodes
     * belonging to a direct child.
     *
     * @param childClass class of the child model.
     * @param key        key of the direct child (doesn't always mean the key of the childClass
     *                   model).
     * @param <T>        class of the child model.
     * @return DatabaseReference pointing to a specific child node or a root of child nodes.
     */
    public <T> DatabaseReference getChildReference(final Class<T> childClass,
                                                   final String key) {
        return getChildReference(childClass).child(key);
    }

    /**
     * Write the current model to the database, creating a new node if it doesn't exist.
     *
     * @param callback called when the operation completes, or immediately if offline.
     */
    @Exclude
    public void save(@Nullable final OnOperationCompleteListener callback) {
        new MultiWrite().save(this).write(callback);
    }

    /**
     * Fetch a single model from the database, and watch for changes until callback.cleanup() is
     * called. The model will have its parent set to "this" (receiver).
     *
     * @param query    Firebase query returning a node to directly parse into the model.
     * @param cls      class of the model to parse the data into.
     * @param callback callback when the data is first available or changed.
     * @param <T>      class of the model to parse the data into.
     */
    @Exclude
    public <T extends AbstractModel> void fetchChild(
            final Query query, final Class<T> cls,
            final AbstractDataAvailableListener<T> callback) {
        query.addValueEventListener(callback.setCleanupPair(query,
                new AbstractOnFBDataChangeListener(callback) {
                    @Override
                    public void onDataChange(final DataSnapshot dataSnapshot) {
                        callback.onData(AbstractModel.fromSnapshot(
                                dataSnapshot, cls, AbstractModel.this));
                    }
                }));
    }

    /**
     * Fetch the model itself from the database, and watch for changes until callback.cleanup() is
     * called. With every change a new object will be created, the fields won't be updated in place.
     * The model will have its parent set to the same as before.
     *
     * @param callback callback when the data is first available or changed.
     * @param cls      class of the model which is being watched.
     * @param <T>      AbstractModel.
     */
    @Exclude
    public <T extends AbstractModel> void watch(final AbstractDataAvailableListener<T> callback,
                                                final Class<T> cls) {
        DatabaseReference selfReference = getReference();
        selfReference.addValueEventListener(callback.setCleanupPair(selfReference,
                new AbstractOnFBDataChangeListener(callback) {
                    @Override
                    public void onDataChange(final DataSnapshot dataSnapshot) {
                        callback.onData(AbstractModel.fromSnapshot(dataSnapshot, cls,
                                getParent()));
                    }
                }));
    }

    /**
     * Similar to fetchChild, but iterates over the objects pointed to by query and invokes callback
     * with a List.
     *
     * @param query    see fetchChild.
     * @param cls      see fetchChild.
     * @param callback see fetchChild.
     * @param <T>      see fetchChild.
     */
    @Exclude
    public <T extends AbstractModel> void fetchChildren(
            final Query query, final Class<T> cls,
            final AbstractDataAvailableListener<List<T>> callback) {
        query.addValueEventListener(callback.setCleanupPair(query,
                new AbstractOnFBDataChangeListener(callback) {
                    @Override
                    public void onDataChange(final DataSnapshot dataSnapshot) {
                        List<T> items = new ArrayList<>((int) dataSnapshot.getChildrenCount());
                        for (DataSnapshot itemSnapshot : dataSnapshot.getChildren()) {
                            items.add(AbstractModel.fromSnapshot(itemSnapshot, cls,
                                    AbstractModel.this));
                        }
                        callback.onData(items);
                    }
                }));
    }

    /**
     * Get the reference pointing to the current model, if it exists.
     *
     * @return a Firebase reference to the node where the model data is located.
     */
    @Exclude
    public DatabaseReference getReference() {
        return getParent().getChildReference(this.getClass(), this.getKey());
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        return "parent=" + getParent() + ", key='" + getKey() + '\'';
    }

}