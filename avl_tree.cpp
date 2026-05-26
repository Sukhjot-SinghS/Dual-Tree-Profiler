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

struct node {
    int data;
    string id;
    int height; 
    node *left, *right;
    char color; 
    node(int x) : data(x), height(1), color('B'), left(nullptr), right(nullptr) {
        id = "node_" + to_string(x) + "_" + to_string(global_node_id_counter++);
    }
};

struct NodeSnapshot {
    string id;
    int data;
    string color;
    bool is_highlighted;
    string highlight_role;
    bool has_error;
    string error_msg;
    NodeSnapshot *left, *right;

    NodeSnapshot(string id_val, int d) {
        id = id_val;
        data = d;
        color = "BLACK"; 
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

NodeSnapshot* deepCopy(node* live_node) {
    if (live_node == nullptr) return nullptr;
    NodeSnapshot* snap = new NodeSnapshot(live_node->id, live_node->data);
    snap->left = deepCopy(live_node->left);
    snap->right = deepCopy(live_node->right);
    return snap;
}

void captureSnapshot(string op, string desc, node* root, node* h1 = nullptr, node* h2 = nullptr, string label1 = "", string label2 = "") {
    if (!is_capturing) return;
    SnapshotFrame frame;
    frame.step_id = current_step_id++;
    frame.operation_type = op;
    frame.action_description = desc;
    frame.root_snapshot = deepCopy(root);

    function<void(NodeSnapshot*)> applyHigh = [&](NodeSnapshot* s) {
        if (!s) return;
        if (h1 != nullptr && s->id == h1->id) { s->is_highlighted = true; s->highlight_role = label1; }
        if (h2 != nullptr && s->id == h2->id) { s->is_highlighted = true; s->highlight_role = label2; }
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
    j["highlight_role"] = node->highlight_role;
    j["has_error"] = node->has_error;
    j["error_msg"] = node->error_msg;
    j["left"] = treeToJson(node->left);
    j["right"] = treeToJson(node->right);
    return j;
}

int height(node* N) {
    if (N == nullptr) return 0;
    return N->height;
}

int getBalance(node* N) {
    if (N == nullptr) return 0;
    return height(N->left) - height(N->right);
}

node* rightRotate(node* &root_ref, node* y) {
    total_rotations++; 
    right_rotations++; 

    node* x = y->left;
    node* T2 = x->right;

    if(is_capturing) captureSnapshot("AVL_ROT", "Right Rotation around " + to_string(y->data), root_ref, y, x, "PIVOT", "NEW PARENT");

    x->right = y;
    y->left = T2;
    y->height = max(height(y->left), height(y->right)) + 1;
    x->height = max(height(x->left), height(x->right)) + 1;
    return x;
}

node* leftRotate(node* &root_ref, node* x) {
    total_rotations++; 
    left_rotations++; 

    node* y = x->right;
    node* T2 = y->left;

    if(is_capturing) captureSnapshot("AVL_ROT", "Left Rotation around " + to_string(x->data), root_ref, x, y, "PIVOT", "NEW PARENT");

    y->left = x;
    x->right = T2;
    x->height = max(height(x->left), height(x->right)) + 1;
    y->height = max(height(y->left), height(y->right)) + 1;
    return y;
}

node* insertNode(node* &root_ref, node* node_ptr, int key) {
    if (node_ptr == nullptr) {
        node* newNode = new node(key);
        if (is_capturing && root_ref == nullptr) root_ref = newNode; 
        return newNode;
    }

    if (key < node_ptr->data) node_ptr->left = insertNode(root_ref, node_ptr->left, key);
    else node_ptr->right = insertNode(root_ref, node_ptr->right, key);

    node_ptr->height = 1 + max(height(node_ptr->left), height(node_ptr->right));
    int balance = getBalance(node_ptr);

    // RESTORED: All the granular step-by-step camera flashes!
    if (balance > 1 && key < node_ptr->left->data) {
        if(is_capturing) captureSnapshot("AVL_UNBAL", "Left-Left Imbalance at " + to_string(node_ptr->data), root_ref, node_ptr, nullptr, "IMBALANCED");
        return rightRotate(root_ref, node_ptr);
    }
    if (balance < -1 && key >= node_ptr->right->data) {
        if(is_capturing) captureSnapshot("AVL_UNBAL", "Right-Right Imbalance at " + to_string(node_ptr->data), root_ref, node_ptr, nullptr, "IMBALANCED");
        return leftRotate(root_ref, node_ptr);
    }
    if (balance > 1 && key >= node_ptr->left->data) {
        if(is_capturing) captureSnapshot("AVL_UNBAL", "Left-Right Imbalance at " + to_string(node_ptr->data), root_ref, node_ptr, nullptr, "IMBALANCED");
        node_ptr->left = leftRotate(root_ref, node_ptr->left);
        if(is_capturing) captureSnapshot("AVL_PARTIAL", "Left rotation completed. Proceeding to right rotation...", root_ref);
        return rightRotate(root_ref, node_ptr);
    }
    if (balance < -1 && key < node_ptr->right->data) {
        if(is_capturing) captureSnapshot("AVL_UNBAL", "Right-Left Imbalance at " + to_string(node_ptr->data), root_ref, node_ptr, nullptr, "IMBALANCED");
        node_ptr->right = rightRotate(root_ref, node_ptr->right);
        if(is_capturing) captureSnapshot("AVL_PARTIAL", "Right rotation completed. Proceeding to left rotation...", root_ref);
        return leftRotate(root_ref, node_ptr);
    }
    return node_ptr;
}

void insert(node* &root, int key) {
    if(is_capturing) captureSnapshot("AVL_START", "Inserting " + to_string(key), root);
    root = insertNode(root, root, key);
    if(is_capturing) captureSnapshot("AVL_DONE", "Tree balanced after inserting " + to_string(key), root);
}

node* minValueNode(node* node_ptr) {
    node* current = node_ptr;
    while (current->left != nullptr) current = current->left;
    return current;
}

node* deleteNodeRec(node* &root_ref, node* root, int key, string target_id = "") {
    if (root == nullptr) return root;
    if (key < root->data) root->left = deleteNodeRec(root_ref, root->left, key, target_id);
    else if (key > root->data) root->right = deleteNodeRec(root_ref, root->right, key, target_id);
    else {
        if (target_id != "" && root->id != target_id) root->right = deleteNodeRec(root_ref, root->right, key, target_id);
        else {
            if ((root->left == nullptr) || (root->right == nullptr)) {
                node *temp = root->left ? root->left : root->right;
                if (temp == nullptr) { temp = root; root = nullptr; } 
                else { *root = *temp; }
                delete temp;
            } 
            else {
                node* temp = minValueNode(root->right);
                if(is_capturing) captureSnapshot("AVL_DEL", "Found Inorder Successor (" + to_string(temp->data) + ")", root_ref, temp, nullptr, "SUCCESSOR");
                root->data = temp->data; 
                root->id = temp->id;     
                root->right = deleteNodeRec(root_ref, root->right, temp->data, temp->id); 
            }
        }
    }

    if (root == nullptr) return root;

    root->height = 1 + max(height(root->left), height(root->right));
    int balance = getBalance(root);

    // RESTORED: Post-deletion unbalance cameras
    if (balance > 1 && getBalance(root->left) >= 0) {
        if(is_capturing) captureSnapshot("AVL_UNBAL", "Left-Left Imbalance post-deletion", root_ref, root, nullptr, "IMBALANCED");
        return rightRotate(root_ref, root);
    }
    if (balance > 1 && getBalance(root->left) < 0) {
        if(is_capturing) captureSnapshot("AVL_UNBAL", "Left-Right Imbalance post-deletion", root_ref, root, nullptr, "IMBALANCED");
        root->left = leftRotate(root_ref, root->left);
        return rightRotate(root_ref, root);
    }
    if (balance < -1 && getBalance(root->right) <= 0) {
        if(is_capturing) captureSnapshot("AVL_UNBAL", "Right-Right Imbalance post-deletion", root_ref, root, nullptr, "IMBALANCED");
        return leftRotate(root_ref, root);
    }
    if (balance < -1 && getBalance(root->right) > 0) {
        if(is_capturing) captureSnapshot("AVL_UNBAL", "Right-Left Imbalance post-deletion", root_ref, root, nullptr, "IMBALANCED");
        root->right = rightRotate(root_ref, root->right);
        return leftRotate(root_ref, root);
    }
    return root;
}

void delete_node(node* &root, int key) {
    if(is_capturing) captureSnapshot("DEL_START", "Initiating deletion of " + to_string(key), root);
    root = deleteNodeRec(root, root, key, ""); 
    if(is_capturing) captureSnapshot("DEL_DONE", "Tree balanced after deleting " + to_string(key), root);
}

int main(int argc, char* argv[]) {
    srand(time(0));
    node* root = nullptr;

    if (argc > 1 && argv[argc - 1][0] == 'B') {
        int benchmark_size = stoi(string(argv[argc - 1]).substr(1));
        is_capturing = false; 
        
        auto start_time = high_resolution_clock::now();
        for(int i = 0; i < benchmark_size; i++) {
            root = insertNode(root, root, rand() % 100000); 
        }
        auto stop_time = high_resolution_clock::now();
        auto duration = duration_cast<microseconds>(stop_time - start_time);

        json payload;
        payload["animation_frames"] = json::array(); 
        payload["telemetry"]["execution_time_us"] = duration.count();
        payload["telemetry"]["rotations"] = total_rotations;
        payload["telemetry"]["left_rotations"] = left_rotations;
        payload["telemetry"]["right_rotations"] = right_rotations;
        payload["telemetry"]["recolors"] = 0; 
        payload["telemetry"]["is_benchmark"] = true;
        
        cout << payload.dump(4) << endl;
        return 0;
    }

    for (int i = 1; i < argc - 1; i++) {
        string cmd = argv[i];
        int val = stoi(cmd.substr(1));
        if (cmd[0] == 'i') root = insertNode(root, root, val);
        else if (cmd[0] == 'd') root = deleteNodeRec(root, root, val, "");
    }

    is_capturing = true; 
    auto start_time = high_resolution_clock::now(); 

    if (argc > 1) {
        string cmd = argv[argc - 1];
        int val = stoi(cmd.substr(1));
        if (cmd[0] == 'i') insert(root, val);
        else if (cmd[0] == 'd') delete_node(root, val);
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
    payload["telemetry"]["recolors"] = 0; 
    payload["telemetry"]["is_benchmark"] = false;

    cout << payload.dump(4) << endl;
    return 0;
}