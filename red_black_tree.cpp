#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
#include <functional>
#include <ctime>
#include <chrono>
#include "json.hpp"

using namespace std;
using namespace std::chrono;
using json = nlohmann::json;

int global_node_id_counter = 1;

// DETAILED TELEMETRY COUNTERS
int total_rotations = 0;
int left_rotations = 0;
int right_rotations = 0;
int recolor_count = 0;

struct node {
    int data;
    string id;
    node *left, *right, *parent;
    char color; 

    // Safe NIL implementation
    node(int x) : data(x), color('R'), left(NIL), right(NIL), parent(NIL) {
        id = "node_" + to_string(x) + "_" + to_string(global_node_id_counter++);
    }

    static node *NIL;
private:
    node() : data(0), id("NIL"), color('B'), left(nullptr), right(nullptr), parent(nullptr) {}
};

node* node::NIL = new node();
#define NIL node::NIL

struct NodeSnapshot {
    string id;
    int data;
    string color;
    bool is_highlighted;
    string highlight_role; 
    bool has_error;
    string error_msg;
    NodeSnapshot *left, *right;

    NodeSnapshot(string id_val, int d, char c) {
        id = id_val;
        data = d;
        color = (c == 'R') ? "RED" : "BLACK";
        is_highlighted = false;
        highlight_role = ""; 
        has_error = false;
        error_msg = "";
        left = right = nullptr;
    }
};

struct SnapshotFrame {
    int step_id;
    string operation_type;
    string action_description;
    NodeSnapshot* root_snapshot;
};

vector<SnapshotFrame> animation_frames;
int current_step_id = 1;
bool is_capturing = false;

int get_black_height(node* n) {
    if (n == NIL) return 1;
    int left_h = get_black_height(n->left);
    return (n->color == 'B') ? left_h + 1 : left_h;
}

void validate_node(node* n, NodeSnapshot* snap) {
    if (n == NIL || !snap) return;
    if (n->color == 'R' && n->parent != NIL && n->parent->color == 'R') {
        snap->has_error = true;
        snap->error_msg = "RED-RED CONFLICT";
    }
    if (get_black_height(n->left) != get_black_height(n->right)) {
        snap->has_error = true;
        snap->error_msg = "BLACK-HEIGHT MISMATCH";
    }
}

NodeSnapshot* deepCopy(node* live_node) {
    if (live_node == NIL) return nullptr;
    NodeSnapshot* snap = new NodeSnapshot(live_node->id, live_node->data, live_node->color);
    snap->left = deepCopy(live_node->left);
    snap->right = deepCopy(live_node->right);
    validate_node(live_node, snap); 
    return snap;
}

void captureSnapshot(string op, string desc, node* root, node* h1 = NIL, node* h2 = NIL, node* h3 = NIL, string label1 = "") {
    if (!is_capturing) return;
    SnapshotFrame frame;
    frame.step_id = current_step_id++;
    frame.operation_type = op;
    frame.action_description = desc;
    frame.root_snapshot = deepCopy(root);

    function<void(NodeSnapshot*)> applyHigh = [&](NodeSnapshot* s) {
        if (!s) return;
        if (h1 != NIL && s->id == h1->id) { s->is_highlighted = true; s->highlight_role = label1; }
        if ((h2 != NIL && s->id == h2->id) || (h3 != NIL && s->id == h3->id)) { s->is_highlighted = true; }
        applyHigh(s->left);
        applyHigh(s->right);
    };
    applyHigh(frame.root_snapshot);
    animation_frames.push_back(frame);
}

json treeToJson(NodeSnapshot* node) {
    if (!node) return nullptr;
    json j;
    j["id"] = node->id;
    j["value"] = node->data;
    j["color"] = node->color;
    j["is_highlighted"] = node->is_highlighted;
    j["has_error"] = node->has_error;
    j["error_msg"] = node->error_msg;
    j["left"] = treeToJson(node->left);
    j["right"] = treeToJson(node->right);
    j["highlight_role"] = node->highlight_role;
    return j;
}

void left_rotate(node * &root, node * x) {
    total_rotations++; left_rotations++; 
    node * y = x->right;
    x->right = y->left;
    if(y->left != NIL) y->left->parent = x;
    y->parent = x->parent;
    if(x->parent == NIL) root = y;
    else if(x == x->parent->left) x->parent->left = y;
    else x->parent->right = y; 
    y->left = x;
    x->parent = y;
}

void right_rotate(node * &root, node * x) {
    total_rotations++; right_rotations++; 
    node * y = x->left;
    x->left = y->right;
    if(y->right != NIL) y->right->parent = x;
    y->parent = x->parent;
    if(x->parent == NIL) root = y;
    else if(x == x->parent->right) x->parent->right = y;
    else x->parent->left = y; 
    y->right = x;
    x->parent = y;
}

void insert_fixup(node* &root, node* z) {
    while(z->parent->color == 'R') {
        node* gp = z->parent->parent;
        if(z->parent == gp->left) {
            node* y = gp->right;
            if(y->color == 'R') {
                if(is_capturing) captureSnapshot("CONFLICT", "Uncle is Red. Red-Red conflict.", root, z, z->parent, y);
                z->parent->color = 'B'; recolor_count++;
                y->color = 'B'; recolor_count++;
                gp->color = 'R'; recolor_count++;
                if(is_capturing) captureSnapshot("RECOLOR", "Recolored parent and uncle to Black.", root, z, z->parent, y);
                z = gp;
            } else {
                if(z == z->parent->right) {
                    if(is_capturing) captureSnapshot("PRE_ROTATE", "Zig-zag detected. Preparing left rotation.", root, z, z->parent);
                    z = z->parent;
                    left_rotate(root, z);
                }
                if(is_capturing) captureSnapshot("PRE_ROTATE", "Line detected. Preparing right rotation.", root, z, z->parent, gp);
                z->parent->color = 'B'; recolor_count++;
                gp->color = 'R'; recolor_count++;
                right_rotate(root, gp);
                if(is_capturing) captureSnapshot("ROTATE_DONE", "Rotation complete.", root, z->parent);
            }
        } else {
            node* y = gp->left;
            if(y->color == 'R') {
                if(is_capturing) captureSnapshot("CONFLICT", "Uncle is Red. Red-Red conflict.", root, z, z->parent, y);
                z->parent->color = 'B'; recolor_count++;
                y->color = 'B'; recolor_count++;
                gp->color = 'R'; recolor_count++;
                if(is_capturing) captureSnapshot("RECOLOR", "Recolored parent and uncle to Black.", root, z, z->parent, y);
                z = gp;
            } else {
                if(z == z->parent->left) {
                    if(is_capturing) captureSnapshot("PRE_ROTATE", "Zig-zag detected. Preparing right rotation.", root, z, z->parent);
                    z = z->parent;
                    right_rotate(root, z);
                }
                if(is_capturing) captureSnapshot("PRE_ROTATE", "Line detected. Preparing left rotation.", root, z, z->parent, gp);
                z->parent->color = 'B'; recolor_count++;
                gp->color = 'R'; recolor_count++;
                left_rotate(root, gp);
                if(is_capturing) captureSnapshot("ROTATE_DONE", "Rotation complete.", root, z->parent);
            }
        }
    }
    if(root->color != 'B') { 
        root->color = 'B'; recolor_count++; 
        if(is_capturing) captureSnapshot("FINAL", "Ensured root is Black.", root);
    }
}

void insert(node * &root, node* z) {
    if(is_capturing) captureSnapshot("START", "Inserting " + to_string(z->data), root);
    node* y = NIL;
    node* x = root;
    while(x != NIL) {
        y = x;
        if(z->data < x->data) x = x->left;
        else x = x->right;
    }
    z->parent = y;
    if(y == NIL) root = z;
    else if(z->data < y->data) y->left = z;
    else y->right = z;
    z->left = z->right = NIL;
    z->color = 'R'; recolor_count++; 
    
    if(is_capturing) captureSnapshot("BST_INSERT", "Placed " + to_string(z->data) + " as RED node.", root, z);
    insert_fixup(root, z);
    if(is_capturing) captureSnapshot("DONE", "Tree balanced after inserting " + to_string(z->data), root);
}

void transplant(node * &root, node * u, node* v) {
    if(u->parent == NIL) root = v;
    else if(u == u->parent->left) u->parent->left = v;
    else u->parent->right = v;
    v->parent = u->parent;
}

node * tree_minimum(node * x) {
    while (x->left != NIL) x = x->left;
    return x;
}

void delete_fixup(node * &root, node * x) {
    while(x->color == 'B' && x != root) {
        if(x == x->parent->left) {
            node * w = x->parent->right;
            if(w->color == 'R') {
                w->color = 'B'; recolor_count++; 
                x->parent->color = 'R'; recolor_count++;
                left_rotate(root, x->parent);
                if(is_capturing) captureSnapshot("DEL_ROT", "Case 1: Left rotate.", root);
                w = x->parent->right;
            }
            if(w->left->color == 'B' && w->right->color == 'B') {
                w->color = 'R'; recolor_count++;
                if(is_capturing) captureSnapshot("DEL_RECOLOR", "Case 2: Recolor.", root);
                x = x->parent;
            } else {
                if(w->right->color == 'B') {
                    w->left->color = 'B'; recolor_count++; 
                    w->color = 'R'; recolor_count++;
                    right_rotate(root, w);
                    if(is_capturing) captureSnapshot("DEL_ROT", "Case 3: Right rotate sibling.", root);
                    w = x->parent->right;
                }
                w->color = x->parent->color; recolor_count++;
                x->parent->color = 'B'; recolor_count++; 
                w->right->color = 'B'; recolor_count++;
                left_rotate(root, x->parent);
                if(is_capturing) captureSnapshot("DEL_ROT", "Case 4: Final rotate.", root);
                x = root;
            }
        } else {
            node * w = x->parent->left;
            if(w->color == 'R') {
                w->color = 'B'; recolor_count++; 
                x->parent->color = 'R'; recolor_count++;
                right_rotate(root, x->parent);
                if(is_capturing) captureSnapshot("DEL_ROT", "Case 1: Right rotate.", root);
                w = x->parent->left;
            }
            if(w->right->color == 'B' && w->left->color == 'B') {
                w->color = 'R'; recolor_count++;
                if(is_capturing) captureSnapshot("DEL_RECOLOR", "Case 2: Recolor.", root);
                x = x->parent;
            } else {
                if(w->left->color == 'B') {
                    w->right->color = 'B'; recolor_count++; 
                    w->color = 'R'; recolor_count++;
                    left_rotate(root, w);
                    if(is_capturing) captureSnapshot("DEL_ROT", "Case 3: Left rotate sibling.", root);
                    w = x->parent->left;
                }
                w->color = x->parent->color; recolor_count++;
                x->parent->color = 'B'; recolor_count++; 
                w->left->color = 'B'; recolor_count++;
                right_rotate(root, x->parent);
                if(is_capturing) captureSnapshot("DEL_ROT", "Case 4: Final rotate.", root);
                x = root;
            }
        }
    }
    if(x->color != 'B') { 
        x->color = 'B'; recolor_count++; 
        if(is_capturing) captureSnapshot("DEL_FINAL", "Ensured black root/node.", root);
    }
}

void delete_node(node * &root, node * z) {
    if (is_capturing) captureSnapshot("DEL_START", "Deleting " + to_string(z->data), root, z);
    node * y = z;
    node * x;
    char y_org_color = y->color;
    if(z->left == NIL) {
        x = z->right; transplant(root, z, z->right);
    } else if (z->right == NIL) {
        x = z->left; transplant(root, z, z->left);
    } else {
        y = tree_minimum(z->right);
        if(is_capturing) captureSnapshot("DEL_MIN", "Found successor " + to_string(y->data), root, y, NIL, NIL, "SUCCESSOR");
        y_org_color = y->color;
        x = y->right;
        if(y->parent == z) x->parent = y;
        else {
            transplant(root, y, y->right);
            y->right = z->right; y->right->parent = y;
        }
        transplant(root, z, y);
        y->left = z->left; y->left->parent = y; 
        y->color = z->color; recolor_count++;
    }
    if(is_capturing) captureSnapshot("DEL_TRANSPLANT", "Replaced node.", root);
    if(y_org_color == 'B') delete_fixup(root, x);
    if (is_capturing) captureSnapshot("DEL_DONE", "Tree balanced after deleting " + to_string(z->data), root);
}

node* find_node(node* root, int val) {
    node* curr = root;
    while(curr != NIL) {
        if(val == curr->data) return curr;
        if(val < curr->data) curr = curr->left;
        else curr = curr->right;
    }
    return NIL;
}

int main(int argc, char* argv[]) {
    srand(time(0));
    node* root = NIL;

    // --- 1. BENCHMARK MODE (10k natively in C++) ---
    if (argc > 1 && argv[argc - 1][0] == 'B') {
        int benchmark_size = stoi(string(argv[argc - 1]).substr(1));
        is_capturing = false; 
        
        auto start_time = high_resolution_clock::now();
        for(int i = 0; i < benchmark_size; i++) {
            insert(root, new node(rand() % 100000));
        }
        auto stop_time = high_resolution_clock::now();
        auto duration = duration_cast<microseconds>(stop_time - start_time);

        json payload;
        payload["animation_frames"] = json::array(); 
        payload["telemetry"]["execution_time_us"] = duration.count();
        payload["telemetry"]["rotations"] = total_rotations;
        payload["telemetry"]["left_rotations"] = left_rotations;
        payload["telemetry"]["right_rotations"] = right_rotations;
        payload["telemetry"]["recolors"] = recolor_count;
        payload["telemetry"]["is_benchmark"] = true;
        
        cout << payload.dump(4) << endl;
        return 0;
    }

    // --- 2. SILENT FAST-FORWARD ---
    for (int i = 1; i < argc - 1; i++) {
        string cmd = argv[i];
        int val = stoi(cmd.substr(1));
        if (cmd[0] == 'i') insert(root, new node(val));
        else if (cmd[0] == 'd') {
            node* target = find_node(root, val);
            if(target != NIL) delete_node(root, target);
        }
    }

    // --- 3. ACTIVE CAPTURE WITH CUMULATIVE METRICS ---
    is_capturing = true; 
    // Notice there is NO total_rotations = 0; here! The metrics are perfectly cumulative.
    auto start_time = high_resolution_clock::now(); 

    if (argc > 1) {
        string cmd = argv[argc - 1];
        int val = stoi(cmd.substr(1));
        if (cmd[0] == 'i') insert(root, new node(val));
        else if (cmd[0] == 'd') {
            node* target = find_node(root, val);
            if(target != NIL) delete_node(root, target);
            else captureSnapshot("ERROR", "Node not found.", root);
        }
    }

    auto stop_time = high_resolution_clock::now(); 
    auto duration = duration_cast<microseconds>(stop_time - start_time);

    json payload;
    json frames = json::array();
    for (const auto& f : animation_frames) {
        json jf;
        jf["step_id"] = f.step_id;
        jf["operation_type"] = f.operation_type;
        jf["action_description"] = f.action_description;
        jf["tree_state"] = treeToJson(f.root_snapshot);
        frames.push_back(jf);
    }
    
    payload["animation_frames"] = frames;
    payload["telemetry"]["execution_time_us"] = duration.count();
    payload["telemetry"]["rotations"] = total_rotations;
    payload["telemetry"]["left_rotations"] = left_rotations;
    payload["telemetry"]["right_rotations"] = right_rotations;
    payload["telemetry"]["recolors"] = recolor_count;
    payload["telemetry"]["is_benchmark"] = false;

    cout << payload.dump(4) << endl;
    return 0;
}